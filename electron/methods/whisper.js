import { spawn } from "child_process";
import { app } from "electron";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { eventBus } from "../eventBus.js";
import fs from "fs";
import { log } from "../log.js";
import { VOICE_MODELS } from "../ai/models.js";
import { isDownloaded, modelPath } from "../ai/llama.js";

let liveProcess = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ADDED: Regex to test for the presence of text in brackets.
const bracketTestRegex = /\[.*?\]/;

function safeSend(event, channel, payload) {
  try {
    event?.sender?.send(channel, payload);
  } catch (err) {
    log.warn(`Failed to send IPC to ${channel}:`, err);
  }
}

/** The best downloaded voice model as whisper arguments, or null before the first download. */
export function voiceModelArgs() {
  const id = VOICE_MODELS.find(isDownloaded);
  if (!id) return null;
  // Only the English-only base model cannot take a language.
  return [
    "--model",
    modelPath(id),
    ...(id === "whisper-base-en" ? [] : ["-l", "auto"]),
  ];
}

export function startLiveTranscription(event) {
  if (liveProcess) {
    log.warn("⚠️ Live transcription already running, skipping start");
    return;
  }
  const modelArgs = voiceModelArgs();
  if (!modelArgs) return { needsModel: true };

  const isDev = !app.isPackaged;

  const basePath = isDev
    ? path.join(__dirname, "..", "resources", "whisper-bin-x64") // dev
    : path.join(process.resourcesPath, "whisper-bin-x64"); // packaged

  const exePath = path.join(basePath, "Release", "whisper-stream.exe");

  liveProcess = spawn(exePath, [...modelArgs, "--capture", "-1"]);

  liveProcess.stdout.on("data", (data) => {
    const msg = data.toString();

    // NEW LOGIC: Test if the message contains bracketed text.
    // If it does, discard the entire chunk and do nothing.
    if (bracketTestRegex.test(msg)) {
      return; // Exit the function, effectively ignoring the chunk.
    }

    // Only send the message if it's not empty.
    // This handles any other empty/whitespace-only outputs.
    if (msg.trim()) {
      const resultObject = { text: msg };
      event.sender.send("live-transcription-data", resultObject);
    }
  });

  liveProcess.stderr.on("data", (err) => {
    log.error("❌ [Whisper STDERR]:", err.toString().trim());
  });

  liveProcess.on("close", (code, signal) => {
    liveProcess = null;
    event.sender.send("live-transcription-stopped");
  });
}

export function stopLiveTranscription() {
  if (liveProcess) {
    liveProcess.kill("SIGINT");
    liveProcess = null;
  } else {
    log.warn("⚠️ stopLiveTranscription called but no process is running");
  }
}

// -------------------
// For blob transcription
// -------------------
export function transcribeAudioBlob(filePath, event) {
  return new Promise((resolve, reject) => {
    const modelArgs = voiceModelArgs();
    if (!modelArgs)
      return reject(new Error("The voice model is not downloaded"));
    const isDev = !app.isPackaged;

    const basePath = isDev
      ? path.join(__dirname, "..", "resources", "whisper-bin-x64") // dev
      : path.join(process.resourcesPath, "whisper-bin-x64"); // packaged

    const exePath = path.join(basePath, "Release", "whisper-cli.exe");

    const whisperProcess = spawn(exePath, [
      ...modelArgs,
      "--file",
      filePath,
      "--output-json",
    ]);

    let output = "";
    let error = "";

    whisperProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    whisperProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    whisperProcess.on("close", (code) => {
      const jsonPath = `${filePath}.json`;
      if (fs.existsSync(jsonPath)) {
        try {
          const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

          // Filter bracketed text
          if (json.transcription && Array.isArray(json.transcription)) {
            json.transcription = json.transcription.filter(
              (seg) => seg.text && !bracketTestRegex.test(seg.text),
            );
          }

          resolve(json);
          safeSend(event, "blob-transcription-result", json);
        } catch (err) {
          log.error("JSON parse error:", err);
          reject(err);
        }
      } else {
        log.error("Whisper JSON file not found:", jsonPath);
        reject(new Error("Whisper JSON file missing"));
      }
    });
  });
}

// Assumes you have access to the eventBus instance.
// Also assumes the event that triggers this passes the original IPC 'event' object.
eventBus.on("journal:audio-saved", ({ entry, event }) => {
  if (!entry.audio_key || !event) {
    if (!entry.audio_key)
      log.error("Audio key missing from 'journal:audio-saved' event.");
    if (!event)
      log.error("IPC event object missing from 'journal:audio-saved' event.");
    return;
  }

  eventBus.emit("whisper:transcribe-started", {
    audioKey: entry.audio_key,
    event,
  });

  transcribeAudioBlob(entry.audio_key, event)
    .then((transcriptionJson) => {
      // Extract plain text
      const transcriptionText = transcriptionJson.transcription
        .map((seg) => seg.text)
        .join(" ")
        .replace(/\[.*?\]/g, "") // remove bracketed notes if you want
        .trim();
      eventBus.emit("whisper:transcribe-ended", { entry, transcriptionText });
      // Save to DB
      // localDB.db.prepare(`
      //     UPDATE journals
      //     SET transcription = ?, updated_at = CURRENT_TIMESTAMP
      //     WHERE id = ?
      // `).run(transcriptionText, entry.id);
    })
    .catch((error) => {
      log.error("💥 Transcription failed for:", entry.audio_key, error);

      event.sender.send("blob-transcription-error", {
        message: "Transcription failed.",
        error: error.message,
      });
    });
});
