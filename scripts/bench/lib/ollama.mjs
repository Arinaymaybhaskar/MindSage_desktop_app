/**
 * Minimal Ollama client for the AI benchmarks.
 *
 * Deliberately does not import electron/methods/ollama.js: that module pulls in
 * electron-store, the db singleton and the event bus at import time, none of
 * which load under ELECTRON_RUN_AS_NODE without an app instance. The request
 * shapes below mirror it exactly - same endpoints, same body fields - and the
 * benchmark imports the real prompt builders from AIPrompts.js, which is
 * dependency-free. If ollama.js changes its request shape, this must follow.
 *
 * Every call returns Ollama's own timing fields alongside wall-clock. They are
 * far more useful than wall-clock alone: `load_duration` separates model load
 * from inference, and `eval_count / eval_duration` gives tokens per second,
 * which is the only generation metric that transfers between machines.
 */

const BASE = "http://localhost:11434";

/** Nanoseconds, as Ollama reports durations. */
const ns = (v) => (typeof v === "number" ? v / 1e6 : null); // -> milliseconds

export async function isUp(timeoutMs = 3000) {
  try {
    const res = await fetch(`${BASE}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels() {
  const res = await fetch(`${BASE}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags: ${res.status}`);
  const data = await res.json();
  return (data.models ?? []).map((m) => ({ name: m.name, sizeBytes: m.size }));
}

/**
 * Evicts a model from memory.
 *
 * `keep_alive: 0` tells Ollama to unload immediately after the request. This is
 * how the cold-start measurements are made honest - without it, the "cold"
 * number is only cold the very first time the suite runs, and every rerun
 * silently reports warm timings.
 */
export async function unload(model) {
  try {
    await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", keep_alive: 0 }),
    });
    // Ollama returns before the memory is actually released; a short settle
    // avoids the next call racing a partially-unloaded model.
    await new Promise((r) => setTimeout(r, 1500));
  } catch {
    /* unload is best-effort - a failure only means the next call is warm */
  }
}

/** Mirrors the embedding call in ollama.js:542. */
export async function embed(text, model = "nomic-embed-text:v1.5") {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embeddings: ${res.status}`);
  const data = await res.json();
  return {
    wallMs: performance.now() - t0,
    dimensions: data.embedding?.length ?? 0,
    vector: data.embedding,
  };
}

/**
 * Non-streaming generation, as the enrichment paths use
 * (ollama.js:255 for metadata, ollama.js:305 for the summary).
 */
export async function generate({
  model,
  prompt,
  jsonMode = false,
  numPredict = 300,
  system,
  temperature,
}) {
  const body = { model, prompt, stream: false, num_predict: numPredict };
  if (jsonMode) body.format = "json";
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  if (numPredict !== undefined) body.options = { num_predict: numPredict };

  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama generate: ${res.status}`);
  const data = await res.json();
  const wallMs = performance.now() - t0;

  return {
    text: data.response ?? "",
    wallMs,
    loadMs: ns(data.load_duration),
    promptEvalMs: ns(data.prompt_eval_duration),
    promptTokens: data.prompt_eval_count ?? null,
    evalMs: ns(data.eval_duration),
    outputTokens: data.eval_count ?? null,
    tokensPerSec:
      data.eval_count && data.eval_duration
        ? Math.round((data.eval_count / (data.eval_duration / 1e9)) * 100) / 100
        : null,
  };
}

/**
 * Streaming generation, as the chat path uses (ollama.js:80).
 *
 * Time to first token is the headline number here. Total generation time is
 * nearly irrelevant to how responsive a chat feels - a reply that starts in
 * 400ms and takes 12 seconds to finish reads as fast, and one that starts in
 * 8 seconds reads as broken, however quickly it then completes.
 */
export async function generateStream({ model, prompt, numPredict = 300, jsonMode = false }) {
  const body = { model, prompt, stream: true, num_predict: numPredict };
  if (jsonMode) body.format = "json";

  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama generate (stream): ${res.status}`);
  if (!res.body) throw new Error("Ollama returned no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let ttftMs = null;
  let text = "";
  let final = {};

  // NDJSON: one JSON object per line, which may be split across chunks.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.response) {
        if (ttftMs === null) ttftMs = performance.now() - t0;
        text += obj.response;
      }
      if (obj.done) final = obj;
    }
  }

  return {
    text,
    ttftMs,
    wallMs: performance.now() - t0,
    loadMs: ns(final.load_duration),
    promptEvalMs: ns(final.prompt_eval_duration),
    promptTokens: final.prompt_eval_count ?? null,
    outputTokens: final.eval_count ?? null,
    tokensPerSec:
      final.eval_count && final.eval_duration
        ? Math.round((final.eval_count / (final.eval_duration / 1e9)) * 100) / 100
        : null,
  };
}
