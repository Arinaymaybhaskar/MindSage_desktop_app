// The built-in provider behind the AI client: llama.cpp in the main process
// through node-llama-cpp, so no Ollama install is needed. Models are GGUF
// files in <userData>/models (see models.js). A model stays loaded between
// calls, so only the first call after launch pays the load.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { log } from "../log.js";
import { modelStore } from "../store.js";
import {
  BUILTIN_MODELS,
  EMBED_MODEL,
  defaultChatModel,
  fitsInMemory,
} from "./models.js";

const CHAT_CONTEXT = { min: 2048, max: 8192 };
/** nomic-embed-text was trained on 2048 tokens; longer text is cut, as Ollama did. */
const EMBED_CONTEXT = 2048;

export const modelsDir = () => path.join(app.getPath("userData"), "models");
export const modelPath = (id) =>
  path.join(modelsDir(), BUILTIN_MODELS[id].file);

/** The chosen chat model, or the one this machine's memory calls for. */
export function chatModelId() {
  const chosen = modelStore.get("builtinModels")?.chat;
  return BUILTIN_MODELS[chosen]?.role === "chat"
    ? chosen
    : defaultChatModel(os.totalmem());
}

/** Not the caller's fault: the indexer retries later instead of failing the item. */
const unavailable = (message) =>
  Object.assign(new Error(message), { code: "AI_UNAVAILABLE" });

let lib = null;
let engine = null; // Promise<Llama>
let gpuFallback = null; // why the GPU was given up for the CPU
const loading = new Map(); // model id -> Promise<entry>, so one load per model
const ready = new Map(); // model id -> { model, ctx, sequence, queue }

function getEngine() {
  engine ??= (async () => {
    lib ??= await import("node-llama-cpp");
    const llama = await lib.getLlama({
      // "auto" tries CUDA, then Vulkan, then the CPU build, whichever loads.
      gpu: gpuFallback ? false : "auto",
      build: "never",
      logger: (level, message) =>
        log.warn(`[llama.cpp] ${level}: ${String(message).slice(0, 200)}`),
    });
    log.info("Built-in AI engine ready", { gpu: llama.gpu });
    return llama;
  })().catch((err) => {
    engine = null;
    throw unavailable(`The built-in AI engine could not start: ${err.message}`);
  });
  return engine;
}

/** Only loaded models are freed; waiting on one still loading could deadlock. */
async function disposeOthers(id) {
  for (const [other, entry] of [...ready]) {
    if (other === id) continue;
    ready.delete(other);
    loading.delete(other);
    await entry.model.dispose();
  }
}

/** Frees every loaded model, e.g. before switching to Ollama. */
export const unloadAll = () => disposeOthers(null);

/** A GPU that fails to load a model gets the CPU from then on, with a notice. */
async function fallBackToCpu(reason) {
  gpuFallback = reason;
  log.warn("Built-in AI: the GPU failed, running on the CPU", { reason });
  const old = engine;
  engine = null;
  await (await old?.catch(() => null))?.dispose();
}

async function open(id) {
  const spec = BUILTIN_MODELS[id];
  const file = modelPath(id);
  if (!fs.existsSync(file))
    throw unavailable(`${spec.label} is not downloaded`);
  if (!fitsInMemory(spec.bytes, os.totalmem())) {
    throw unavailable(`${spec.label} needs more memory than this PC has`);
  }
  // Two models (say mood and summary) stay loaded together only if both fit.
  if (spec.bytes * 1.3 > os.freemem()) await disposeOthers(id);

  const llama = await getEngine();
  let model;
  try {
    model = await llama.loadModel({ modelPath: file });
    const ctx =
      spec.role === "embed"
        ? await model.createEmbeddingContext({ contextSize: EMBED_CONTEXT })
        : await model.createContext({ contextSize: CHAT_CONTEXT });
    const sequence = spec.role === "embed" ? null : ctx.getSequence();
    const entry = { model, ctx, sequence, queue: Promise.resolve() };
    ready.set(id, entry);
    log.info("Built-in AI model loaded", { id, gpu: llama.gpu });
    return entry;
  } catch (err) {
    await model?.dispose().catch(() => {});
    const othersLoaded = [...ready.keys()].some((other) => other !== id);
    if (err instanceof lib.InsufficientMemoryError) {
      if (!othersLoaded) {
        throw unavailable(`${spec.label} does not fit in memory`);
      }
      await disposeOthers(id);
      return open(id);
    }
    if (llama.gpu === false) throw err;
    await disposeOthers(id);
    await fallBackToCpu(err.message);
    return open(id);
  }
}

function load(id) {
  if (!loading.has(id)) {
    loading.set(
      id,
      open(id).catch((err) => {
        loading.delete(id);
        throw err;
      }),
    );
  }
  return loading.get(id);
}

/** One call at a time per model: a context has one sequence. */
function serial(entry, task) {
  const run = entry.queue.then(task, task);
  entry.queue = run.catch(() => {});
  return run;
}

/** See client.js for the options. `ollamaModel` does not apply here. */
export async function generate(
  prompt,
  {
    system,
    schema,
    json = false,
    maxTokens,
    temperature = 0.8,
    onToken,
    signal,
    model = chatModelId(),
  } = {},
) {
  if (!prompt) throw new Error("A prompt is required.");
  const entry = await load(model);
  return serial(entry, async () => {
    const llama = await getEngine();
    const grammar = schema
      ? await llama.createGrammarForJsonSchema(schema)
      : json
        ? await llama.getGrammarFor("json")
        : undefined;
    // The sequence outlives the session, so a prompt that starts like the last
    // one reuses its evaluated prefix.
    const session = new lib.LlamaChatSession({
      contextSequence: entry.sequence,
      systemPrompt: system ?? "",
      autoDisposeSequence: false,
    });
    let full = "";
    try {
      return await session.prompt(prompt, {
        grammar,
        maxTokens,
        temperature,
        topK: 40,
        topP: 0.9,
        signal,
        onTextChunk: (fragment) => {
          full += fragment;
          onToken?.(fragment, full);
        },
      });
    } finally {
      session.dispose({ disposeSequence: false });
    }
  });
}

export async function embed(text) {
  const entry = await load(EMBED_MODEL);
  return serial(entry, async () => {
    // Room for the start and end tokens the context adds.
    const tokens = entry.model.tokenize(text).slice(0, EMBED_CONTEXT - 3);
    const { vector } = await entry.ctx.getEmbeddingFor(tokens);
    return Array.from(vector);
  });
}

/** Loads the chat model in the background, so the first call is fast. */
export function warmUp() {
  const id = chatModelId();
  if (!fs.existsSync(modelPath(id))) return;
  load(id).catch((err) =>
    log.warn("Built-in AI warm-up failed", { id, error: err.message }),
  );
}

export async function status() {
  const llama = await engine?.catch(() => null);
  return {
    gpu: llama ? llama.gpu : null,
    gpuFallback,
    chatModel: chatModelId(),
    models: Object.entries(BUILTIN_MODELS).map(([id, spec]) => ({
      id,
      label: spec.label,
      role: spec.role,
      bytes: spec.bytes,
      downloaded: fs.existsSync(modelPath(id)),
      fits: fitsInMemory(spec.bytes, os.totalmem()),
    })),
  };
}
