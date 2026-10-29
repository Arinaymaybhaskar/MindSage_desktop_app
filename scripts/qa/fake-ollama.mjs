// Fake Ollama for QA, no models needed. Each option also reads FAKE_OLLAMA_<NAME>
// (upper case, dashes to underscores), e.g. FAKE_OLLAMA_PORT=11500.
//   node scripts/qa/fake-ollama.mjs [--port 11434] [--embed-delay-ms 0]
//     [--fail-text WORD]...  500 for any request whose prompt contains WORD
//     [--tags-hang]          /api/tags never answers
//     [--models a,b] [--title T] [--mood-score 4] [--mood-tags Calm,Content]
//     [--summary S] [--answer A] [--suggestion S] [--requires-context]
//     [--log file.jsonl] [--pid file]
// Refuses to start when the port is taken (exit 2, says what answers there).
import http from "node:http";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { portTaken } from "./procs.mjs";
import { moodWord } from "../../electron/moodWords.js";

const spec = {
  port: { type: "string", default: "11434" },
  "embed-delay-ms": { type: "string", default: "0" },
  "fail-text": { type: "string", multiple: true, default: [] },
  "tags-hang": { type: "boolean", default: false },
  models: { type: "string", default: "llama3.2:1b,nomic-embed-text:v1.5" },
  title: { type: "string", default: "A calm morning" },
  "mood-score": { type: "string", default: "4" },
  "mood-tags": { type: "string", default: "Content,Peaceful" },
  summary: {
    type: "string",
    default: "The writer had a quiet, calm morning and felt content.",
  },
  answer: { type: "string", default: "Your entries show a calm week." },
  suggestion: { type: "string", default: "What made it calm?" },
  "requires-context": { type: "boolean", default: false },
  log: { type: "string" },
  pid: { type: "string" },
};
const { values: v } = parseArgs({ options: spec });
for (const [k, o] of Object.entries(spec)) {
  const env = process.env[`FAKE_OLLAMA_${k.toUpperCase().replace(/-/g, "_")}`];
  if (env === undefined) continue;
  if (o.multiple) v[k] = env.split(",");
  else if (o.type === "boolean") v[k] = env === "1" || env === "true";
  else v[k] = env;
}
const port = Number(v.port);

if (await portTaken(port)) {
  const who = await fetch(`http://127.0.0.1:${port}/api/version`, {
    signal: AbortSignal.timeout(1500),
  })
    .then(async (r) => `answers /api/version: ${(await r.text()).slice(0, 80)}`)
    .catch(() => "accepts connections but does not answer HTTP");
  let pid = "";
  try {
    if (v.pid)
      pid = `; pid file ${v.pid} says ${fs.readFileSync(v.pid, "utf8")}`;
  } catch {}
  console.error(
    `port ${port} is taken: it ${who}${pid}. Not killing it. Use --port.`,
  );
  process.exit(2);
}

const log = (rec) =>
  v.log &&
  fs.appendFileSync(
    v.log,
    JSON.stringify({ t: new Date().toISOString(), ...rec }) + "\n",
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// 768 numbers, same text gives the same unit vector (the app's index expects 768).
function embed(text) {
  const vec = new Array(768).fill(0);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 2166136261;
    for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    vec[h % 768] += 1;
  }
  const norm = Math.hypot(...vec) || 1;
  return vec.map((x) => x / norm);
}

// Which reply the app wants, told apart by its own prompts (AIPrompts.js).
function reply(prompt, jsonMode) {
  // Ask's plan (KAN-447): with no query, the app searches the question.
  if (prompt.includes("You are MindSage's planner"))
    return JSON.stringify({
      intent: v["requires-context"] ? "search" : "none",
      arguments: {},
      unchecked: "",
    });
  if (prompt.includes("emotional analysis and sentiment extraction"))
    return JSON.stringify({
      title: v.title,
      mood: moodWord(v["mood-score"]),
      mood_tags: v["mood-tags"].split(","),
    });
  if (prompt.includes("You are a summarization engine")) return v.summary;
  return jsonMode
    ? JSON.stringify({
        response: v.answer,
        suggested_user_prompt: v.suggestion,
      })
    : v.answer;
}

const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {}
  const prompt = String(body.prompt ?? "");
  const rec = {
    method: req.method,
    url: req.url,
    model: body.model,
    promptChars: prompt.length,
  };
  const failing = v["fail-text"].find((w) => w && prompt.includes(w));

  if (req.url === "/api/tags") {
    log({ ...rec, status: v["tags-hang"] ? "hang" : 200 });
    if (v["tags-hang"]) return; // never answer
    const models = v.models.split(",").map((name) => ({
      name,
      model: name,
      size: 1e9,
      digest: `fake${name}`.padEnd(64, "0"),
    }));
    return json(res, 200, { models });
  }
  if (req.url === "/api/version")
    return json(res, 200, { version: "0.0.0-fake" });
  if (req.url === "/api/show")
    return json(res, 200, {
      details: { family: "fake" },
      modified_at: new Date().toISOString(),
    });

  if (req.url === "/api/embeddings" || req.url === "/api/generate") {
    if (req.url === "/api/embeddings") await sleep(Number(v["embed-delay-ms"]));
    if (failing) {
      log({ ...rec, status: 500, failedOn: failing });
      return json(res, 500, { error: "fake-ollama: forced failure" });
    }
    log({ ...rec, status: 200 });
    if (req.url === "/api/embeddings")
      return json(res, 200, { embedding: embed(prompt) });
    const text = reply(prompt, body.format === "json");
    if (body.stream === false)
      return json(res, 200, { model: body.model, response: text, done: true });
    // The app streams NDJSON: one {response} piece per line, then {done:true}.
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    const step = Math.max(1, Math.ceil(text.length / 4));
    for (let i = 0; i < text.length; i += step)
      res.write(
        JSON.stringify({
          model: body.model,
          response: text.slice(i, i + step),
          done: false,
        }) + "\n",
      );
    return res.end(
      JSON.stringify({ model: body.model, response: "", done: true }) + "\n",
    );
  }
  log({ ...rec, status: 404 });
  json(res, 404, { error: "fake-ollama: not implemented" });
});

server.listen(port, "127.0.0.1", () => {
  if (v.pid) fs.writeFileSync(v.pid, String(process.pid));
  console.log(`fake-ollama listening 127.0.0.1:${port} pid=${process.pid}`);
});
const stop = () => {
  if (v.pid) fs.rmSync(v.pid, { force: true });
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
