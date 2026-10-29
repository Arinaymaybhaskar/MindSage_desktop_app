// Runs the Ask test set (KAN-445) against a local Ollama and a throwaway
// journal. Start it with `npm run ask:eval` (that runs this under Electron as
// Node). Nothing leaves this PC: the only network calls are to Ollama on
// 127.0.0.1, and the report is written to a local folder.
//
//   --model <name>   Ollama model that plans and answers (default llama3.2:latest)
//   --only <list>    question ids or categories, comma separated (S01,dates)
//   --limit <n>      only the first n questions (for slow machines)
//   --out <dir>      where reports and scores go (default ./.ask-eval)
//   --keep           keep the throwaway journal and print where it is

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildJournal } from "./journal.mjs";
import { buildQuestions, pickQuestions } from "./questions.mjs";
import { seedJournal } from "./seed.mjs";
import {
  formatReport,
  recordScore,
  scoreQuestion,
  summarise,
} from "./score.mjs";

const { values: v } = parseArgs({
  options: {
    model: { type: "string", default: "llama3.2:latest" },
    only: { type: "string" },
    limit: { type: "string" },
    out: { type: "string", default: ".ask-eval" },
    keep: { type: "boolean", default: false },
  },
});

const QUESTION_TIMEOUT_MS = 5 * 60_000;
const OLLAMA = "http://127.0.0.1:11434";

async function main() {
  const up = await fetch(`${OLLAMA}/api/version`, {
    signal: AbortSignal.timeout(3000),
  }).then(
    (r) => r.ok,
    () => false,
  );
  if (!up) {
    console.error(`Ollama does not answer at ${OLLAMA}. Start it first.`);
    return 1;
  }

  // A throwaway profile, set before any app module loads. Never the real one.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-ask-eval-"));
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_DB_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  register("./hooks.mjs", import.meta.url);

  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const app = (p) => import(pathToFileURL(path.join(root, "electron", p)).href);
  const { default: localDB } = await app("db/index.js");
  const index = await app("db/searchIndex.js");
  const { signIn } = await app("session.js");
  const { modelStore } = await app("store.js");
  const { embed } = await app("ai/client.js");
  const { embedFitting } = await app("ai/embedFitting.js");
  const { aiResponse } = await app("methods/chat.js");
  const { eventBus } = await app("eventBus.js");
  // aiResponse reports its failures here and returns nothing.
  let failure = null;
  eventBus.on("chat:error", (error) => (failure = error?.message));

  try {
    modelStore.set("aiProvider", "ollama");
    localDB.initDatabase();
    const journal = buildJournal();
    console.log("Seeding the demo journal and embedding it ...");
    const seeded = await seedJournal(
      { db: localDB.db, localDB, index },
      journal,
      (text) => embedFitting(embed, text),
    );
    console.log(`  ${seeded.entries} entries, ${seeded.goals} goals`);
    const userId = seeded.userIds.A;
    signIn({ id: userId, username: journal.users[0].username });

    const all = buildQuestions(journal);
    const questions = pickQuestions(all, v.only, v.limit);
    if (!questions.length) {
      console.error("No question matches --only.");
      return 1;
    }
    const results = [];
    for (const q of questions) {
      const started = performance.now();
      let run = {};
      failure = null;
      try {
        const res = await aiResponse(q.q, null, null, v.model, {
          userId,
          history: q.history ?? [],
          signal: AbortSignal.timeout(QUESTION_TIMEOUT_MS),
        });
        run = {
          answer: res?.chatResponse?.response,
          plan: res?.plan,
          tool: res?.tool,
          error: res ? null : (failure ?? "no answer"),
        };
      } catch (error) {
        run = { error: String(error?.message ?? error) };
      }
      run.ms = Math.round(performance.now() - started);
      const scored = scoreQuestion(q, run);
      results.push(scored);
      console.log(
        `${q.id} ${scored.pass ? "pass" : "FAIL"} ${run.ms} ms  ${q.q}`,
      );
    }

    const summary = summarise(results, { total: all.length });
    const report = formatReport(v.model, results, summary);
    console.log(`\n${report}`);
    const out = path.resolve(v.out);
    fs.mkdirSync(out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.join(
      out,
      `report-${v.model.replace(/[^\w.-]/g, "_")}-${stamp}`,
    );
    fs.writeFileSync(`${base}.txt`, report);
    fs.writeFileSync(
      `${base}.json`,
      JSON.stringify({ model: v.model, summary, results }, null, 2),
    );
    recordScore(path.join(out, "ask-eval-scores.json"), v.model, summary);
    console.log(`\nReport: ${base}.txt\nScores: ${out}/ask-eval-scores.json`);
    return 0;
  } finally {
    localDB.db.close();
    if (v.keep) console.log(`Journal kept at ${dir}`);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
}

process.exit(await main());
