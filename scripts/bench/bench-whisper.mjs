/**
 * Benchmarks Whisper.cpp speech-to-text.
 *
 * Runs the bundled `whisper-cli.exe` with exactly the arguments
 * electron/methods/whisper.js:93 passes, against the bundled `ggml-tiny.en`
 * model, so the numbers describe the shipped configuration rather than a
 * generic whisper benchmark.
 *
 * Test audio is synthesised on the fly with the Windows speech API and
 * converted to 16 kHz mono with the bundled ffmpeg - the same conversion a
 * recorded voice note goes through (media.js:91-97), which is timed separately
 * because it sits on the critical path before transcription can even start.
 *
 * No audio is committed to the repo: a couple of minutes of speech is several
 * megabytes, and the source text plus a fixed voice reproduces it. **The
 * synthesised voice differs between machines**, so transcription accuracy is
 * not comparable across them; the timings are.
 *
 * The headline metric is the real-time factor:
 *
 *   RTF = processing time / audio duration
 *
 * Below 1.0 means faster than real time. RTF is the number to quote - raw
 * seconds do not transfer between machines, ratios mostly do.
 *
 *   node scripts/bench/bench-whisper.mjs --out results.json
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

import { summarise, fmt } from "./lib/stats.mjs";
import { JOURNAL_SHORT, JOURNAL_MEDIUM, JOURNAL_LONG } from "./fixtures/corpus.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const RUNS = Number(flag("--runs", "3"));

const whisperDir = path.join(repoRoot, "resources", "whisper-bin-x64");
const exePath = path.join(whisperDir, "Release", "whisper-cli.exe");
const modelPath = path.join(whisperDir, "models", "ggml-tiny.en.bin");

if (process.platform !== "win32") {
  console.error("This benchmark uses the Windows speech API and the win32 whisper build.");
  process.exit(1);
}
for (const required of [exePath, modelPath]) {
  if (!fs.existsSync(required)) {
    console.error(`Missing: ${required}`);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-bench-whisper-"));
const results = {};

/** PCM WAV duration from the header's byte rate. */
function wavDurationSec(file) {
  const fd = fs.openSync(file, "r");
  const header = Buffer.alloc(44);
  fs.readSync(fd, header, 0, 44, 0);
  fs.closeSync(fd);
  const byteRate = header.readUInt32LE(28);
  const size = fs.statSync(file).size;
  return byteRate > 0 ? (size - 44) / byteRate : 0;
}

/** Synthesises speech to a WAV using System.Speech, offline. */
function synthesise(text, outFile) {
  const script = `
    Add-Type -AssemblyName System.Speech
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.Rate = 0
    $s.SetOutputToWaveFile(${JSON.stringify(outFile)})
    $s.Speak(${JSON.stringify(text)})
    $s.Dispose()
  `;
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: "ignore",
  });
}

/** 16 kHz mono, matching convertWebmToWav in media.js. */
function toWhisperFormat(inFile, outFile) {
  const t0 = performance.now();
  execFileSync(ffmpegPath, ["-y", "-i", inFile, "-ar", "16000", "-ac", "1", outFile], {
    stdio: "ignore",
  });
  return performance.now() - t0;
}

/** One transcription, exactly as whisper.js spawns it. */
function transcribe(file) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const proc = spawn(exePath, ["--model", modelPath, "--file", file, "--output-json"]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-300)}`));
      resolve(performance.now() - t0);
    });
  });
}

try {
  const clips = [
    { name: "short", text: JOURNAL_SHORT },
    { name: "medium", text: JOURNAL_MEDIUM },
    { name: "long", text: JOURNAL_LONG },
  ];

  const conversionSamples = [];

  for (const clip of clips) {
    const rawWav = path.join(tmp, `${clip.name}-raw.wav`);
    const wav = path.join(tmp, `${clip.name}.wav`);

    synthesise(clip.text, rawWav);
    conversionSamples.push(toWhisperFormat(rawWav, wav));

    const durationSec = wavDurationSec(wav);
    const samples = [];
    for (let i = 0; i < RUNS; i++) samples.push(await transcribe(wav));

    const stats = summarise(samples);
    const rtf = stats.p50 / 1000 / durationSec;

    results[`transcribe.${clip.name}`] = {
      ...stats,
      audioDurationSec: Math.round(durationSec * 10) / 10,
      realTimeFactor: Math.round(rtf * 1000) / 1000,
      speedVsRealtime: `${Math.round((1 / rtf) * 10) / 10}x`,
    };

    console.log(
      `  ${`transcribe.${clip.name}`.padEnd(26)} ` +
        `audio ${durationSec.toFixed(1)}s  p50 ${fmt(stats.p50).padStart(9)}  ` +
        `RTF ${rtf.toFixed(3)} (${Math.round((1 / rtf) * 10) / 10}x realtime)`
    );
  }

  /**
   * The WebM to WAV step every voice note pays before transcription can begin.
   * Pure overhead on the critical path, and easy to overlook because it is
   * hidden inside the save handler rather than the transcribe handler.
   */
  results["ffmpeg.conversion"] = summarise(conversionSamples);
  console.log(
    `  ${"ffmpeg.conversion".padEnd(26)} p50 ${fmt(results["ffmpeg.conversion"].p50).padStart(9)}`
  );

  /**
   * Fixed cost of spawning the binary and loading the model, measured on a
   * clip short enough that inference is negligible. Every transcription pays
   * this - there is no persistent whisper process.
   */
  {
    const tinyRaw = path.join(tmp, "tiny-raw.wav");
    const tiny = path.join(tmp, "tiny.wav");
    synthesise("Okay.", tinyRaw);
    toWhisperFormat(tinyRaw, tiny);
    const samples = [];
    for (let i = 0; i < RUNS; i++) samples.push(await transcribe(tiny));
    results["whisper.spawnAndModelLoad"] = {
      ...summarise(samples),
      note: "Near-empty clip: approximates the fixed per-transcription overhead.",
    };
    console.log(
      `  ${"whisper.spawnAndModelLoad".padEnd(26)} p50 ${fmt(results["whisper.spawnAndModelLoad"].p50).padStart(9)}`
    );
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const report = {
  model: "ggml-tiny.en",
  modelBytes: fs.statSync(modelPath).size,
  runs: RUNS,
  results,
};

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}
