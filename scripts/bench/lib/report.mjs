/**
 * Renders a benchmark run as markdown.
 *
 * The markdown is the point of the exercise, not a nicety. A timing that lives
 * only in a terminal cannot be compared against next month's run, and a
 * performance claim nobody can reproduce is worth nothing. Each run records the
 * machine, the pragmas and the dataset sizes alongside the numbers so a later
 * reader can tell a real improvement from a faster laptop.
 */

import os from "node:os";
import { execFileSync } from "node:child_process";
import { fmt, fmtBytes } from "./stats.mjs";

export function machineInfo() {
  const cpus = os.cpus();
  return {
    platform: `${os.platform()} ${os.release()}`,
    cpu: cpus[0]?.model?.trim() ?? "unknown",
    cores: cpus.length,
    totalMemBytes: os.totalmem(),
    node: process.versions.node,
    electron: process.versions.electron ?? null,
    v8: process.versions.v8,
  };
}

/**
 * Which code the run measured.
 *
 * Without this a stored result says when it was taken and on what hardware, but
 * not what it was taken *of* - and a before/after ledger whose two sides cannot
 * be tied to commits is a set of dates, not evidence. `dirty` matters as much as
 * the hash: a run against uncommitted edits is not reproducible from the hash
 * alone, and saying so is better than implying otherwise.
 */
export function gitInfo() {
  const run = (args) =>
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    return {
      commit: run(["rev-parse", "HEAD"]),
      branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
      dirty: run(["status", "--porcelain"]).length > 0,
    };
  } catch {
    // Not a checkout, or no git on PATH. A run is still worth recording.
    return { commit: null, branch: null, dirty: null };
  }
}

const BR = String.fromCharCode(10);
const row = (cells) => `| ${cells.join(" | ")} |`;
const divider = (n) => `|${" --- |".repeat(n)}`;

/**
 * Scenario timings across dataset sizes.
 *
 * Reading across a row is the whole trick: a cost that stays flat as entries
 * grow is an indexed lookup, and one that grows in proportion is a table scan.
 * That slope is the evidence, far more than any single cell.
 */
function timingTable(runs, metric = "p95") {
  const volumes = runs.map((r) => r.entries);
  // The contention scenario is excluded here and reported on its own. It uses a
  // different sampling rule and its timings include deliberate interference
  // from a second thread, so listing it beside single-threaded numbers invites
  // a comparison that is not valid.
  const names = [...new Set(runs.flatMap((r) => Object.keys(r.results)))].filter(
    (n) => !n.startsWith("contention.")
  );

  const lines = [
    row(["Scenario", ...volumes.map((v) => `${v.toLocaleString()} entries`), "Slope"]),
    divider(volumes.length + 2),
  ];

  for (const name of names) {
    const cells = runs.map((r) => {
      const res = r.results[name];
      if (!res) return "-";
      if (res.error) return "error";
      return fmt(res[metric]);
    });

    // Growth from the smallest to the largest dataset, which is the number that
    // separates "fine" from "will be unusable in two years".
    const first = runs[0]?.results[name];
    const last = runs[runs.length - 1]?.results[name];
    let slope = "-";
    if (first?.[metric] > 0 && last?.[metric] > 0) {
      const ratio = last[metric] / first[metric];
      slope = ratio >= 1.5 ? `**${ratio.toFixed(1)}×**` : `${ratio.toFixed(1)}×`;
    }

    lines.push(row([`\`${name}\``, ...cells, slope]));
  }
  return lines.join("\n");
}

/** Which statements do full table scans, at the largest volume measured. */
function scanTable(run) {
  const lines = [row(["Scenario", "Full table scans"]), divider(2)];
  let any = false;
  for (const [name, plans] of Object.entries(run.plans ?? {})) {
    const scans = plans.flatMap((p) => p.scans ?? []);
    if (scans.length === 0) continue;
    any = true;
    lines.push(row([`\`${name}\``, scans.map((s) => `\`${s}\``).join("<br>")]));
  }
  return any ? lines.join("\n") : "_No full table scans recorded._";
}

function contentionSection(runs) {
  const lines = [
    row([
      "Entries",
      "reads sampled",
      "read p50",
      "read p95",
      "read max",
      "SQLITE_BUSY errors",
      "writes completed",
    ]),
    divider(7),
  ];
  for (const run of runs) {
    const c = run.results["contention.listWhileWorkerWrites"];
    if (!c || c.error) {
      lines.push(row([run.entries.toLocaleString(), "error", "-", "-", "-", "-", "-"]));
      continue;
    }
    // Sample count is shown because p95 over a handful of reads is just the
    // slowest of them. Without n, a noisy row is indistinguishable from a
    // finding.
    lines.push(
      row([
        run.entries.toLocaleString(),
        String(c.n),
        fmt(c.p50),
        fmt(c.p95),
        fmt(c.max),
        String(c.busyErrors),
        String(c.writesCompleted ?? "-"),
      ])
    );
  }
  return lines.join("\n");
}

function mediaSection(media) {
  if (!media?.results) return "_Not measured._";
  const lines = [
    row(["Scenario", "p50", "p95", "File size", "Encoded size", "Inflation"]),
    divider(6),
  ];
  for (const [name, r] of Object.entries(media.results)) {
    lines.push(
      row([
        `\`${name}\``,
        fmt(r.p50),
        fmt(r.p95),
        r.fileBytes ? fmtBytes(r.fileBytes) : "-",
        r.encodedBytes ? fmtBytes(r.encodedBytes) : "-",
        r.inflation ? `${r.inflation}×` : "-",
      ])
    );
  }
  return lines.join("\n");
}

function sizeSection(size) {
  if (!size?.results) return "_Not measured._";
  const lines = [row(["Target", "Size", "Files"]), divider(3)];
  for (const [label, r] of Object.entries(size.results)) {
    lines.push(
      row([label, r.missing ? `_${r.hint}_` : fmtBytes(r.bytes), r.missing ? "-" : String(r.files)])
    );
  }

  const breakdown = Object.entries(size.resourceBreakdown ?? {}).sort(
    (a, b) => (b[1].bytes ?? 0) - (a[1].bytes ?? 0)
  );
  if (breakdown.length > 0) {
    lines.push("", "**`resources/` breakdown**", "", row(["Item", "Size"]), divider(2));
    for (const [name, r] of breakdown) lines.push(row([`\`${name}\``, fmtBytes(r.bytes)]));
  }

  const installers = Object.entries(size.installers ?? {});
  if (installers.length > 0) {
    lines.push("", "**Installers**", "", row(["Artefact", "Size"]), divider(2));
    for (const [name, bytes] of installers) lines.push(row([`\`${name}\``, fmtBytes(bytes)]));
  }

  return lines.join("\n");
}


/**
 * AI pipeline. Model identity is printed above the numbers because a latency
 * figure without the model tag is meaningless - and because the app's chat and
 * embedding models can be changed from the settings page.
 */
function aiSection(ai) {
  if (!ai?.results) return "_Not measured. Run `npm run bench -- --stages ai` with Ollama running._";

  const r = ai.results;
  const lines = [
    `**Chat model:** \`${ai.ollama?.chatModel}\` · **Embedding model:** \`${ai.ollama?.embedModel}\``,
    "",
    row(["Scenario", "p50", "p95", "Notes"]),
    divider(4),
  ];

  for (const [name, v] of Object.entries(r)) {
    if (name === "embed.projectedBacklog" || name === "embed.sustainedThroughput") continue;
    if (v.skipped) {
      lines.push(row([`\`${name}\``, "-", "-", `_${v.reason}_`]));
      continue;
    }
    const notes = [];
    if (v.tokensPerSec) notes.push(`${v.tokensPerSec} tok/s`);
    if (v.parseSuccessRate) notes.push(`parsed ${v.parseSuccessRate}`);
    if (v.usableRate) notes.push(`usable ${v.usableRate}`);
    if (v.dimensions) notes.push(`${v.dimensions}d`);
    if (v.wallMs !== undefined && v.p50 === undefined) {
      lines.push(row([`\`${name}\``, fmt(v.wallMs), "-", notes.join(", ") || "single sample"]));
      continue;
    }
    lines.push(row([`\`${name}\``, fmt(v.p50), fmt(v.p95), notes.join(", ")]));
  }

  const thr = r["embed.sustainedThroughput"];
  const backlog = r["embed.projectedBacklog"];
  if (thr) {
    lines.push(
      "",
      `**Sustained embedding throughput:** ${thr.embeddingsPerSec}/sec (${thr.msPerEmbedding}ms each)`
    );
  }
  if (backlog) {
    lines.push(
      "",
      "**Projected worker backfill** (embedding only - excludes the Qdrant upsert and",
      "the SQLite write per entry, both of which contend with foreground reads):",
      "",
      row(["Journal size", "Backfill time"]),
      divider(2)
    );
    for (const [k, v] of Object.entries(backlog)) lines.push(row([k, v]));
  }
  return lines.join(BR);
}

/** Vector search. Latency only - says nothing about result quality. */
function vectorSection(vector) {
  if (!vector?.results) return "_Not measured. Run `npm run bench -- --stages vector`._";
  const r = vector.results;
  const lines = [row(["Measurement", "Value"]), divider(2)];

  const startup = r["qdrant.startupToReady"];
  if (startup) lines.push(row(["Process spawn to ready", fmt(startup.wallMs)]));

  for (const size of vector.sizes ?? []) {
    const s = r[`search.at${size}`];
    const rss = r[`qdrant.rssAt${size}`];
    const up = r[`upsert.to${size}`];
    if (s) {
      lines.push(
        row([
          `Search at ${size.toLocaleString()} vectors (p50 / p95)`,
          `${fmt(s.p50)} / ${fmt(s.p95)}`,
        ])
      );
    }
    if (up?.vectorsPerSec) {
      lines.push(row([`Upsert rate to ${size.toLocaleString()}`, `${up.vectorsPerSec}/sec`]));
    }
    if (rss?.bytes) lines.push(row([`Resident memory at ${size.toLocaleString()}`, fmtBytes(rss.bytes)]));
  }

  const disk = r["qdrant.storageOnDisk"];
  if (disk) {
    lines.push(
      row([
        `Storage on disk (${disk.vectors?.toLocaleString()} vectors)`,
        `${fmtBytes(disk.bytes)} — includes mmap preallocation`,
      ])
    );
  }
  return lines.join(BR);
}

/** Speech-to-text. RTF is the portable number; raw seconds are machine-bound. */
function whisperSection(whisper) {
  if (!whisper?.results) return "_Not measured. Run `npm run bench -- --stages whisper`._";
  const lines = [
    `**Model:** \`${whisper.model}\` (${fmtBytes(whisper.modelBytes ?? 0)})`,
    "",
    row(["Scenario", "Audio", "p50", "Real-time factor", "Speed"]),
    divider(5),
  ];
  for (const [name, v] of Object.entries(whisper.results)) {
    lines.push(
      row([
        `\`${name}\``,
        v.audioDurationSec ? `${v.audioDurationSec}s` : "-",
        fmt(v.p50),
        v.realTimeFactor !== undefined ? String(v.realTimeFactor) : "-",
        v.speedVsRealtime ?? "-",
      ])
    );
  }
  lines.push("", "_RTF = processing time ÷ audio duration. Below 1.0 is faster than real time._");
  return lines.join(BR);
}

/** Cold start, per step. */
function startupSection(startup) {
  if (!startup?.stepStats) return "_Not measured. Requires a packaged build; run `npm run build` first._";
  const lines = [
    row(["Step", "p50", "p95"]),
    divider(3),
  ];
  for (const [marker, s] of Object.entries(startup.stepStats)) {
    lines.push(row([marker, fmt(s.p50), fmt(s.p95)]));
  }
  lines.push("", `**Total (p50):** ${fmt(startup.totals?.p50)} across ${startup.runs} run(s)`);
  if (startup.note) lines.push("", `_${startup.note}_`);
  return lines.join(BR);
}


/** App-level measurements taken through CDP against a seeded profile. */
function appSection(app) {
  if (!app?.results || app.results.error) {
    return `_Not measured${app?.results?.error ? `: ${app.results.error}` : ". Requires a packaged build."}_`;
  }
  const lines = [
    `Measured against a generated profile of **${app.entries?.toLocaleString()} entries**.`,
    "",
    row(["Measurement", "p50", "p95", "Payload / detail"]),
    divider(4),
  ];
  for (const [name, v] of Object.entries(app.results)) {
    if (name === "memory.overSession" || name === "render.journalListScroll") continue;
    if (v.error) {
      lines.push(row([`\`${name}\``, "error", "-", v.error]));
      continue;
    }
    lines.push(
      row([
        `\`${name}\``,
        fmt(v.p50),
        fmt(v.p95),
        v.payloadBytes ? fmtBytes(v.payloadBytes) : "-",
      ])
    );
  }

  const scroll = app.results["render.journalListScroll"];
  if (scroll && !scroll.error) {
    lines.push(
      "",
      "**Journal list scrolling**",
      "",
      row(["Frame p50", "Frame p95", "Dropped frames", "DOM nodes"]),
      divider(4),
      row([
        fmt(scroll.p50),
        fmt(scroll.p95),
        `${scroll.droppedFrames}/${scroll.framesSampled} (${scroll.droppedPercent}%)`,
        String(scroll.domNodes ?? "-"),
      ])
    );
  }

  const mem = app.results["memory.overSession"];
  if (mem) {
    lines.push(
      "",
      "**Memory across three passes over five routes**",
      "",
      row(["Start RSS", "End RSS", "Change"]),
      divider(3),
      row([
        fmtBytes(mem.startRssBytes ?? 0),
        fmtBytes(mem.endRssBytes ?? 0),
        mem.growthBytes === null ? "-" : `${mem.growthBytes >= 0 ? "+" : ""}${fmtBytes(Math.abs(mem.growthBytes))}`,
      ])
    );
    if (mem.note) lines.push("", `_${mem.note}_`);
  }
  return lines.join(BR);
}

/** Renderer bundle attributed to the packages that produced it. */
function bundleSection(bundle) {
  if (!bundle?.totals) return "_Not measured._";
  const t = bundle.totals;
  const lines = [
    row(["Total", "Size"]),
    divider(2),
    row(["JavaScript", fmtBytes(t.javascriptBytes)]),
    row(["JavaScript (gzipped)", fmtBytes(t.javascriptGzipBytes)]),
    row(["CSS", fmtBytes(t.cssBytes)]),
    row(["Unattributed (bundler scaffolding)", fmtBytes(t.unattributedBytes)]),
    "",
    "**Bytes by owning package**",
    "",
    row(["Package", "Size", "Share of JS"]),
    divider(3),
  ];
  for (const [owner, bytes] of Object.entries(bundle.byOwner ?? {})) {
    const share = t.javascriptBytes ? `${((bytes / t.javascriptBytes) * 100).toFixed(1)}%` : "-";
    lines.push(row([`\`${owner}\``, fmtBytes(bytes), share]));
  }
  if (bundle.note) lines.push("", `_${bundle.note}_`);
  return lines.join(BR);
}


/** Chat RAG, split into its four serialized stages. */
function ragSection(rag) {
  if (!rag?.results || rag.results.error) {
    return `_Not measured${rag?.results?.error ? `: ${rag.results.error}` : "._"}`;
  }
  const r = rag.results;
  const share = r["rag.shareOfTotal"] ?? {};
  const lines = [
    `Chat model \`${rag.chatModel}\`, ${rag.corpusSize} entries indexed.`,
    "",
    row(["Stage", "p50", "p95", "Share of total"]),
    divider(4),
  ];
  for (const key of [
    "rag.1.queryPlanning",
    "rag.2.embedding",
    "rag.3.vectorSearch",
    "rag.4.answerGeneration",
    "rag.total",
  ]) {
    const v = r[key];
    if (!v) continue;
    lines.push(row([`\`${key}\``, fmt(v.p50), fmt(v.p95), share[key] ?? "-"]));
  }
  const plan = r["rag.1.queryPlanning"]?.planParseRate;
  if (plan) lines.push("", `_Query-plan JSON parsed ${plan}._`);
  return lines.join(BR);
}

/**
 * Retrieval quality. The only non-speed measurement in the suite, and the only
 * one that can catch a change making search worse while making it faster.
 */
function qualitySection(quality) {
  if (!quality?.summary) return "_Not measured._";
  const s = quality.summary;
  const kKey = Object.keys(s).find((k) => k.startsWith("recall@"));
  const lines = [
    row(["Metric", "Score"]),
    divider(2),
    row([`\`${kKey}\``, String(s[kKey])]),
    row(["MRR", String(s.mrr)]),
    row(["precision@1", String(s["precision@1"])]),
    "",
    `Model \`${s.embedModel}\`${s.taskPrefixes ? " with task prefixes" : ""}, ` +
      `${s.corpusEntries} labelled entries, ${s.queries} queries.`,
  ];

  const misses = (quality.perQuery ?? []).filter((q) => !q.topHitRelevant);
  if (misses.length) {
    lines.push(
      "",
      `**${misses.length} of ${s.queries} queries returned an irrelevant top hit**`,
      "",
      row(["Query", "Top hit", "Expected"]),
      divider(3)
    );
    for (const m of misses) {
      lines.push(row([m.query, String(m.returned[0] ?? "-"), m.relevant.join(", ")]));
    }
  }
  lines.push(
    "",
    "_Scores are corpus-relative. An absolute value means little; a drop between runs means something broke._"
  );
  return lines.join(BR);
}

export function renderMarkdown({ label, timestamp, machine, dbRuns, media, size, ai, vector, whisper, startup, app, bundle, rag, quality }) {
  const largest = dbRuns[dbRuns.length - 1];
  const pragmas = largest?.pragmas ?? {};

  return `# MindSage — Benchmark: \`${label}\`

**Run:** ${timestamp}
**Machine:** ${machine.cpu} · ${machine.cores} cores · ${fmtBytes(machine.totalMemBytes)} RAM · ${machine.platform}
**Runtime:** Node ${machine.node}${machine.electron ? ` · Electron ${machine.electron}` : ""}

Generated by \`npm run bench\`. Do not edit by hand — re-run instead.

## Database configuration at run time

| Pragma | Value |
| --- | --- |
${Object.entries(pragmas)
  .map(([k, v]) => `| \`${k}\` | \`${v}\` |`)
  .join("\n")}

## Query latency (p95)

${timingTable(dbRuns, "p95")}

## Query latency (p50)

${timingTable(dbRuns, "p50")}

## Query plans at ${largest?.entries?.toLocaleString() ?? "?"} entries

${scanTable(largest ?? {})}

## Read latency while the background worker writes

Reproduces the main-process/worker-thread contention described in [PERFORMANCE.md](../PERFORMANCE.md) §1.1.

${contentionSection(dbRuns)}

## Media over IPC

${mediaSection(media)}

## AI pipeline (Ollama)

${aiSection(ai)}

## Vector search (Qdrant)

${vectorSection(vector)}

## Speech-to-text (Whisper.cpp)

${whisperSection(whisper)}

## Application cold start

${startupSection(startup)}

## Application layer (IPC, rendering, memory)

${appSection(app)}

## Renderer bundle composition

${bundleSection(bundle)}

## Chat RAG pipeline

${ragSection(rag)}

## Retrieval quality

${qualitySection(quality)}

## Disk footprint

${sizeSection(size)}

## Dataset

| Entries | Seed time | DB file size |
| --- | --- | --- |
${dbRuns
  .map(
    (r) =>
      `| ${r.entries.toLocaleString()} | ${fmt(r.seedMs)} | ${fmtBytes(r.dbSizeBytes)} |`
  )
  .join("\n")}
`;
}

/**
 * Delta table between two runs.
 *
 * This is what turns a pair of benchmark runs into a defensible claim: it names
 * the scenario, both numbers, and the ratio, so the improvement can be quoted
 * with the conditions attached rather than as a bare multiplier.
 */
export function renderComparison(before, after, metric = "p95") {
  const volumes = (after.dbRuns ?? []).map((r) => r.entries);
  const sections = [];

  for (const [i, volume] of volumes.entries()) {
    const b = (before.dbRuns ?? []).find((r) => r.entries === volume);
    const a = after.dbRuns[i];
    if (!b) continue;

    const lines = [
      `### ${volume.toLocaleString()} entries`,
      "",
      row(["Scenario", `before ${metric}`, `after ${metric}`, "Change"]),
      divider(4),
    ];

    for (const name of Object.keys(a.results)) {
      const bv = b.results[name]?.[metric];
      const av = a.results[name]?.[metric];
      if (!(bv > 0) || !(av > 0)) continue;
      const ratio = bv / av;
      const change =
        ratio >= 1.1
          ? `**${ratio.toFixed(1)}× faster**`
          : ratio <= 0.9
            ? `${(1 / ratio).toFixed(1)}× slower`
            : "unchanged";
      lines.push(row([`\`${name}\``, fmt(bv), fmt(av), change]));
    }
    sections.push(lines.join("\n"));
  }

  const dbBlock = volumes.length
    ? [
        "## Database",
        "",
        row(["", "Before", "After"]),
        divider(3),
        row([
          "`journal_mode`",
          `\`${before.dbRuns.at(-1)?.pragmas?.journal_mode}\``,
          `\`${after.dbRuns.at(-1)?.pragmas?.journal_mode}\``,
        ]),
        row([
          "`synchronous`",
          `\`${before.dbRuns.at(-1)?.pragmas?.synchronous}\``,
          `\`${after.dbRuns.at(-1)?.pragmas?.synchronous}\``,
        ]),
        row([
          "Full table scans",
          String(before.dbRuns.at(-1)?.totalScans),
          String(after.dbRuns.at(-1)?.totalScans),
        ]),
        "",
        sections.join(`${BR}${BR}`),
      ].join(BR)
    : "";

  const blocks = [
    dbBlock,
    timingCompare("AI pipeline", before.ai, after.ai, metric),
    timingCompare("Vector search", before.vector, after.vector, metric),
    timingCompare("Chat RAG", before.rag, after.rag, metric),
    timingCompare("Application layer", before.app, after.app, metric),
    timingCompare("Speech-to-text", before.whisper, after.whisper, metric),
    startupCompare(before.startup, after.startup, metric),
    qualityCompare(before.quality, after.quality),
    bundleCompare(before.bundle, after.bundle),
  ].filter(Boolean);

  return `# MindSage — Benchmark comparison

**Before:** \`${before.label}\` (${before.timestamp}${before.commit ? `, \`${before.commit.slice(0, 8)}\`${before.dirty ? " +uncommitted" : ""}` : ""})
**After:** \`${after.label}\` (${after.timestamp}${after.commit ? `, \`${after.commit.slice(0, 8)}\`${after.dirty ? " +uncommitted" : ""}` : ""})

${machineWarning(before, after)}${regressionBlock(blocks)}${modelTable(before, after)}
${blocks.join(`${BR}${BR}`)}

${notCompared(before, after)}`;
}

/**
 * What got worse, stated before anything else.
 *
 * The per-stage tables mark every row faster, slower or unchanged and leave the
 * reader to scan for the bad one. With forty rows that is a reading exercise
 * nobody performs twice, and the single regression is exactly the row that
 * matters - an optimisation that trades a win in one place for a loss in
 * another is the normal way performance work goes wrong.
 */
function regressionBlock(blocks) {
  const regressions = [];
  for (const block of blocks) {
    const [heading] = block.split(BR);
    const section = heading.replace(/^#+\s*/, "");
    for (const line of block.split(BR)) {
      const m = line.match(/^\|\s*(.+?)\s*\|.*\|\s*([\d.]+)× slower\s*\|/);
      if (m) regressions.push({ section, name: m[1], factor: Number(m[2]) });
      const worse = line.match(/^\|\s*(.+?)\s*\|.*\|\s*[−+]([\d.]+)% worse\s*\|/);
      if (worse) regressions.push({ section, name: worse[1], factor: null, pct: Number(worse[2]) });
    }
  }
  if (!regressions.length) {
    return `**No regressions.** Nothing measured on both sides got slower.${BR}${BR}`;
  }

  regressions.sort((a, b) => (b.factor ?? 0) - (a.factor ?? 0));
  const lines = [
    `> ## ⚠ ${regressions.length} measurement${regressions.length > 1 ? "s" : ""} got worse`,
    ">",
    `> | Section | Measurement | Change |`,
    `> | --- | --- | --- |`,
    ...regressions.map(
      (r) =>
        `> | ${r.section} | ${r.name} | ${r.factor ? `**${r.factor}× slower**` : `**${r.pct}% worse**`} |`
    ),
    ">",
    "> A win elsewhere does not cancel these. Decide deliberately whether each is",
    "> an acceptable trade, and record the decision in the optimisation log.",
    "",
    "",
  ];
  return lines.join(BR);
}

/**
 * Same machine, or the whole document is worthless.
 *
 * A comparison is the one place where mixing hardware turns an honest pair of
 * measurements into a false claim, so a mismatch is stated at the top of the
 * report rather than left in the source files for someone to notice.
 */
function machineWarning(before, after) {
  const key = (m) => `${m?.platform}|${m?.cpu}|${m?.cores}|${m?.totalMemBytes}`;
  if (key(before.machine) === key(after.machine)) {
    return `Both runs are from \`${after.machine?.cpu}\`, ${after.machine?.cores} cores. ${BR}${BR}`;
  }
  return [
    "> **These runs are from different machines. Do not quote any ratio below.**",
    `> Before: ${before.machine?.cpu} (${before.machine?.cores} cores).`,
    `> After: ${after.machine?.cpu} (${after.machine?.cores} cores).`,
    "",
    "",
  ].join(BR);
}

/**
 * The model tags both runs used.
 *
 * Swapping a model moves the AI numbers further than any code change, so a
 * comparison that silently spans two different models would attribute a model's
 * effect to whatever was edited. Printing the tags side by side makes that
 * impossible to miss.
 */
function modelTable(before, after) {
  const tags = (r) => ({
    chat: r?.ai?.ollama?.chatModel ?? r?.rag?.chatModel ?? null,
    embed: r?.ai?.ollama?.embedModel ?? r?.quality?.summary?.embedModel ?? null,
  });
  const b = tags(before);
  const a = tags(after);
  if (!b.chat && !b.embed && !a.chat && !a.embed) return "";

  const cell = (v) => (v ? `\`${v}\`` : "-");
  // A tag missing from one side means that stage was not run, which is not the
  // same as a model having been swapped - and calling it a swap would invent a
  // change that never happened.
  const verdict = (x, y) => {
    if (!x || !y) return "not measured both sides";
    return x === y ? "same" : "**changed**";
  };
  const swapped = (x, y) => Boolean(x) && Boolean(y) && x !== y;
  const lines = [
    row(["Model", "Before", "After", "Held fixed?"]),
    divider(4),
    row(["Chat", cell(b.chat), cell(a.chat), verdict(b.chat, a.chat)]),
    row(["Embedding", cell(b.embed), cell(a.embed), verdict(b.embed, a.embed)]),
  ];
  if (swapped(b.chat, a.chat) || swapped(b.embed, a.embed)) {
    lines.push(
      "",
      "_A model changed between these runs. Every AI, RAG and retrieval-quality" +
        " figure below reflects that swap as well as any code change._"
    );
  }
  return `${lines.join(BR)}${BR}`;
}

/**
 * Delta for any stage shaped as `{ results: { scenario: { p50, p95 } } }`,
 * which is every timing stage in the suite.
 */
function timingCompare(title, before, after, metric) {
  const b = before?.results;
  const a = after?.results;
  if (!b || !a || before?.skipped || after?.skipped) return "";

  const lines = [
    `## ${title}`,
    "",
    row(["Scenario", `before ${metric}`, `after ${metric}`, "Change"]),
    divider(4),
  ];
  let rows = 0;
  for (const name of Object.keys(a)) {
    const bv = b[name]?.[metric];
    const av = a[name]?.[metric];
    if (!(bv > 0) || !(av > 0)) continue;
    lines.push(row([`\`${name}\``, fmt(bv), fmt(av), speedChange(bv, av)]));
    rows += 1;
  }
  return rows ? lines.join(BR) : "";
}

/** Cold start: the total is the number a user feels; the steps say why. */
function startupCompare(before, after, metric) {
  if (!before?.totals || !after?.totals || before?.skipped || after?.skipped) return "";
  const lines = [
    "## Cold start",
    "",
    row(["Step", `before ${metric}`, `after ${metric}`, "Change"]),
    divider(4),
    row([
      "**Total to visible window**",
      fmt(before.totals[metric]),
      fmt(after.totals[metric]),
      speedChange(before.totals[metric], after.totals[metric]),
    ]),
  ];
  for (const name of Object.keys(after.stepStats ?? {})) {
    const bv = before.stepStats?.[name]?.[metric];
    const av = after.stepStats?.[name]?.[metric];
    if (!(bv > 0) || !(av > 0)) continue;
    lines.push(row([name, fmt(bv), fmt(av), speedChange(bv, av)]));
  }
  return lines.join(BR);
}

/**
 * Retrieval quality, where higher is better and every other number in the suite
 * can improve while this one collapses.
 */
function qualityCompare(before, after) {
  const b = before?.summary;
  const a = after?.summary;
  if (!b || !a) return "";

  const metrics = ["precision@1", "recall@5", "mrr"];
  const lines = [
    "## Retrieval quality",
    "",
    `Corpus of ${a.corpusEntries} entries, ${a.queries} queries, k=${a.k}. Higher is better.`,
    "",
    row(["Metric", "Before", "After", "Change"]),
    divider(4),
  ];
  for (const name of metrics) {
    const bv = b[name];
    const av = a[name];
    if (typeof bv !== "number" || typeof av !== "number") continue;
    const delta = av - bv;
    const change =
      Math.abs(delta) < 0.001
        ? "unchanged"
        : `${delta > 0 ? "**+" : "−"}${Math.abs((delta / (bv || 1)) * 100).toFixed(0)}%${delta > 0 ? "**" : ""}`;
    lines.push(row([`\`${name}\``, bv.toFixed(3), av.toFixed(3), change]));
  }
  if (b.embedModel !== a.embedModel) {
    lines.push(
      "",
      `_Embedding model differs: \`${b.embedModel}\` → \`${a.embedModel}\`._`
    );
  }
  return lines.join(BR);
}

/** Renderer bytes, where smaller is better. */
function bundleCompare(before, after) {
  if (!before?.totals || !after?.totals) return "";
  const lines = [
    "## Renderer bundle",
    "",
    row(["", "Before", "After", "Change"]),
    divider(4),
    row([
      "Total JavaScript",
      fmtBytes(before.totals.javascriptBytes),
      fmtBytes(after.totals.javascriptBytes),
      sizeChange(before.totals.javascriptBytes, after.totals.javascriptBytes),
    ]),
    row([
      "JavaScript (gzipped)",
      fmtBytes(before.totals.javascriptGzipBytes),
      fmtBytes(after.totals.javascriptGzipBytes),
      sizeChange(before.totals.javascriptGzipBytes, after.totals.javascriptGzipBytes),
    ]),
  ];
  const owners = new Set([
    ...Object.keys(before.byOwner ?? {}),
    ...Object.keys(after.byOwner ?? {}),
  ]);
  for (const owner of owners) {
    const bv = before.byOwner?.[owner] ?? 0;
    const av = after.byOwner?.[owner] ?? 0;
    // Only the movers: an unchanged dependency list is noise in a delta report.
    if (Math.abs(av - bv) < 10_000) continue;
    lines.push(row([`\`${owner}\``, fmtBytes(bv), fmtBytes(av), sizeChange(bv, av)]));
  }
  return lines.join(BR);
}

/** Lower is better: `before / after` above 1 is an improvement. */
function speedChange(bv, av) {
  const ratio = bv / av;
  if (ratio >= 1.1) return `**${ratio.toFixed(1)}× faster**`;
  if (ratio <= 0.9) return `${(1 / ratio).toFixed(1)}× slower`;
  return "unchanged";
}

function sizeChange(bv, av) {
  if (!bv || !av) return "-";
  const delta = av - bv;
  if (Math.abs(delta / bv) < 0.02) return "unchanged";
  return delta < 0
    ? `**−${fmtBytes(-delta)}**`
    : `+${fmtBytes(delta)}`;
}

/**
 * Names the stages that produced no delta.
 *
 * A stage missing from one side is invisible in a table of what changed, which
 * reads as "nothing moved" when the truth is "nobody looked".
 */
function notCompared(before, after) {
  const stages = ["db", "ai", "vector", "rag", "app", "whisper", "startup", "quality", "bundle"];
  const has = (r, s) => {
    if (s === "db") return (r.dbRuns ?? []).length > 0;
    const v = r[s];
    return Boolean(v) && !v.skipped;
  };
  const missing = stages.filter((s) => !(has(before, s) && has(after, s)));
  if (!missing.length) return "All eleven stages compared.\n";
  return [
    "## Not compared",
    "",
    `No delta for ${missing.map((s) => `\`${s}\``).join(", ")} — the stage is`,
    "absent or skipped on at least one side. Re-run both with the same",
    "`--stages` set if the change could have moved it.",
    "",
  ].join(BR);
}
