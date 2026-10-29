// The built-in provider behind the AI client: llama.cpp in the main process
// through node-llama-cpp, so no Ollama install is needed. Models are GGUF
// files in <userData>/models (see models.js). A model stays loaded between
// calls, so only the first call after launch pays the load. No electron
// import: main.js names the models folder, so any importer (and any test)
// can load this module without the Electron binary.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "../log.js";
import { modelStore } from "../store.js";
import {
  BUILTIN_MODELS,
  CUDA_ENGINE,
  EMBED_MODEL,
  TASK_MODELS,
  defaultChatModel,
  fitsInMemory,
} from "./models.js";
import { isUnpacked, unpackedDir, useDownloadedCuda } from "./cuda.js";

const CHAT_CONTEXT = { min: 2048, max: 8192 };
/** nomic-embed-text was trained on 2048 tokens; longer text is cut, as Ollama did. */
const EMBED_CONTEXT = 2048;
/** A call that names no limit still ends: the engine default is the context. */
const DEFAULT_MAX_TOKENS = 512;
// Set before the GPU is first used and cleared once a call has worked there or
// the app quit cleanly; still set at launch means the GPU took the app down.
const GPU_PENDING = "builtinGpuPending";
const CPU_ONLY = "builtinCpuOnly"; // { reason, at }: why the GPU is not used
const CUDA_OFF = "builtinCudaOff"; // why the CUDA build is skipped for Vulkan
// The GPU is tried again after this, so an unclean exit while starting (a
// kill, a crash, a shutdown) or a one-off load error does not pin the CPU for
// good; a GPU that still fails is caught again the same way.
const GPU_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const GPU_CRASHED =
  "The GPU stopped MindSage last time, so the built-in AI runs on the CPU.";
const CUDA_CRASHED =
  "The CUDA engine stopped MindSage last time, so the built-in AI uses Vulkan.";

const rememberCpuOnly = (reason) =>
  modelStore.set(CPU_ONLY, { reason, at: Date.now() });
/** The saved reason while it is recent; a bare string (saved before expiry existed) has expired. */
function savedCpuOnly() {
  const saved = modelStore.get(CPU_ONLY);
  return saved?.at > Date.now() - GPU_RETRY_MS ? saved.reason : null;
}

let modelsRoot = null;
/** main.js sets this from userData before anything uses the engine. */
export function setModelsDir(dir) {
  modelsRoot = dir;
}

/** The id the user's own .gguf (KAN-79) runs under; a chat model checked by gguf.js. */
export const CUSTOM_MODEL = "custom-gguf";
let customSpec = null;
export function setCustomModel(checked) {
  customSpec = checked && {
    label: checked.name,
    role: "chat",
    bytes: checked.bytes,
    path: checked.path,
  };
}
const specOf = (id) => (id === CUSTOM_MODEL ? customSpec : BUILTIN_MODELS[id]);

export const modelPath = (id) => {
  if (id === CUSTOM_MODEL) return customSpec.path;
  if (!modelsRoot) throw new Error("The models folder is not set");
  return path.join(modelsRoot, BUILTIN_MODELS[id].file);
};

/** Downloads are renamed into place only after their SHA-256 matched. */
export function isDownloaded(id) {
  try {
    if (specOf(id).role === "engine")
      return isUnpacked(unpackedDir(modelPath(id)));
    return fs.statSync(modelPath(id)).size === specOf(id).bytes;
  } catch {
    return false;
  }
}

/** The chosen chat model while it is on disk, else the one this machine's memory calls for. */
export function chatModelId() {
  const chosen = modelStore.get("builtinModels")?.chat;
  return BUILTIN_MODELS[chosen]?.role === "chat" && isDownloaded(chosen)
    ? chosen
    : defaultChatModel(os.totalmem());
}

/** The model for an enrichment task (models.js), or the chat model when it is not here. */
export function taskModelId(task) {
  const id = TASK_MODELS[task];
  return id &&
    isDownloaded(id) &&
    fitsInMemory(BUILTIN_MODELS[id].bytes, os.totalmem())
    ? id
    : chatModelId();
}

/** Whether the chat and embedding models are both on disk. */
export const modelsReady = () =>
  isDownloaded(chatModelId()) && isDownloaded(EMBED_MODEL);

/** Not the caller's fault: the indexer retries later instead of failing the item. */
const unavailable = (message) =>
  Object.assign(new Error(message), { code: "AI_UNAVAILABLE" });

let lib = null;
let engine = null; // Promise<Llama>
let gpuFallback = null; // why the GPU was given up for the CPU
let gpuProven = false;
const loading = new Map(); // model id -> Promise<entry>, so one load per model
const ready = new Map(); // model id -> { model, ctx, sequence, queue, closed }

function getEngine() {
  engine ??= (async () => {
    const pending = modelStore.get(GPU_PENDING);
    if (!gpuFallback && pending === "cuda") {
      modelStore.set(CUDA_OFF, CUDA_CRASHED);
      modelStore.delete(GPU_PENDING);
      log.warn("Built-in AI: CUDA crashed last launch, using Vulkan");
    } else if (!gpuFallback && pending) {
      rememberCpuOnly(GPU_CRASHED);
      modelStore.delete(GPU_PENDING);
      log.warn("Built-in AI: the GPU crashed last launch, using the CPU");
    }
    gpuFallback ??= savedCpuOnly();
    if (!gpuFallback) {
      modelStore.delete(CPU_ONLY);
      modelStore.set(GPU_PENDING, true);
    }
    useDownloadedCuda(unpackedDir(modelPath(CUDA_ENGINE)));
    lib ??= await import("node-llama-cpp");
    const llama = await lib.getLlama({
      // "auto" tries CUDA (only when downloaded), then Vulkan, then the CPU.
      gpu: gpuFallback
        ? false
        : modelStore.get(CUDA_OFF)
          ? { type: "auto", exclude: ["cuda"] }
          : "auto",
      build: "never",
      logger: (level, message) =>
        log.warn(`[llama.cpp] ${level}: ${String(message).slice(0, 200)}`),
    });
    if (llama.gpu === false) markGpuSafe();
    else if (llama.gpu === "cuda" && !gpuProven) {
      modelStore.set(GPU_PENDING, "cuda"); // a crash now skips CUDA, not the GPU
    }
    log.info("Built-in AI engine ready", { gpu: llama.gpu });
    return llama;
  })().catch((err) => {
    engine = null;
    throw unavailable(`The built-in AI engine could not start: ${err.message}`);
  });
  return engine;
}

function markGpuSafe() {
  if (gpuProven) return;
  gpuProven = true;
  modelStore.delete(GPU_PENDING);
}

/** Lets running and queued calls finish, then frees the model. */
async function unload(id) {
  const entry = ready.get(id);
  ready.delete(id);
  loading.delete(id);
  if (!entry) return;
  entry.closed = true; // calls queued from now on get AI_UNAVAILABLE
  await entry.queue;
  await entry.model.dispose();
}

async function disposeOthers(id) {
  for (const other of [...ready.keys()]) if (other !== id) await unload(other);
}

/** Frees every model, waiting for any still loading, e.g. before Ollama. */
export async function unloadAll() {
  await Promise.allSettled([...loading.values()]);
  await disposeOthers(null);
}

export const isStarted = () => engine !== null;

/** Disposes every model and the engine, then loads the chat model again. */
export async function restart() {
  await unloadAll();
  await (await engine?.catch(() => null))?.dispose();
  engine = null;
  const id = chatModelId();
  if (isDownloaded(id)) await generate("Hi", { model: id, maxTokens: 1 });
}

/** On quit: frees the engine. A clean exit is not a GPU crash. */
export async function shutdown() {
  modelStore.delete(GPU_PENDING);
  await unloadAll();
  await (await engine?.catch(() => null))?.dispose();
  engine = null;
}

/** A GPU that fails to load a model gets the CPU from then on, with a notice. */
async function fallBackToCpu(reason) {
  gpuFallback = reason;
  rememberCpuOnly(reason);
  modelStore.delete(GPU_PENDING);
  log.warn("Built-in AI: the GPU failed, running on the CPU", { reason });
  const old = engine;
  engine = null;
  await (await old?.catch(() => null))?.dispose();
}

/** CUDA that fails to load a model is skipped from then on: Vulkan runs instead. */
async function skipCuda(reason) {
  modelStore.set(CUDA_OFF, reason);
  modelStore.delete(GPU_PENDING);
  log.warn("Built-in AI: CUDA failed, using Vulkan", { reason });
  const old = engine;
  engine = null;
  await (await old?.catch(() => null))?.dispose();
}

async function open(id) {
  const spec = specOf(id);
  const file = modelPath(id);
  if (!isDownloaded(id)) throw unavailable(`${spec.label} is not downloaded`);
  if (!fitsInMemory(spec.bytes, os.totalmem())) {
    throw unavailable(`${spec.label} needs more memory than this PC has`);
  }
  // Two models (say mood and summary) stay loaded together only if both fit
  // in total memory. Free memory is not used: macOS reports file cache as used,
  // which would swap the two models on every call.
  const othersBytes = [...ready.keys()]
    .filter((other) => other !== id)
    .reduce((sum, other) => sum + specOf(other).bytes, 0);
  if (othersBytes && !fitsInMemory(othersBytes + spec.bytes, os.totalmem())) {
    await disposeOthers(id);
  }

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
    log.info("Built-in AI model loaded", {
      id,
      gpu: llama.gpu,
      gpuLayers: model.gpuLayers,
      contextSize: spec.role === "embed" ? EMBED_CONTEXT : ctx.contextSize,
    });
    return entry;
  } catch (err) {
    await model?.dispose().catch(() => {});
    const othersLoaded = [...ready.keys()].some((other) => other !== id);
    if (err instanceof lib.InsufficientMemoryError) {
      // One retry with the others freed, then give up: no unload loop.
      if (!othersLoaded) {
        throw unavailable(`${spec.label} does not fit in memory`);
      }
      await disposeOthers(id);
      return open(id);
    }
    if (llama.gpu === false) throw err;
    await disposeOthers(id);
    if (llama.gpu === "cuda") await skipCuda(err.message);
    else await fallBackToCpu(err.message);
    return open(id);
  }
}

let opening = Promise.resolve();
/** Loads one model at a time, so each load sees what the last one left loaded. */
function load(id) {
  if (!loading.has(id)) {
    const run = opening.then(() => open(id));
    opening = run.catch(() => {});
    loading.set(
      id,
      run.catch((err) => {
        loading.delete(id);
        throw err;
      }),
    );
  }
  return loading.get(id);
}

/** One call at a time per model: a context has one sequence. */
function serial(entry, task) {
  const guarded = async () => {
    if (entry.closed) throw unavailable("The model was unloaded; try again");
    const result = await task();
    markGpuSafe();
    return result;
  };
  const run = entry.queue.then(guarded, guarded);
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
    maxTokens = DEFAULT_MAX_TOKENS,
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
    let grammar;
    if (schema) grammar = await llama.createGrammarForJsonSchema(schema);
    else if (json) grammar = await llama.getGrammarFor("json");
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

/**
 * Loads the chat model in the background and runs one token, so the first real
 * call is fast and a GPU that works is known to work before anyone waits on it.
 */
export function warmUp() {
  const id = chatModelId();
  if (!isDownloaded(id)) return;
  generate("Hi", { model: id, maxTokens: 1 }).catch((err) =>
    log.warn("Built-in AI warm-up failed", { id, error: err.message }),
  );
}

export async function status() {
  const llama = await engine?.catch(() => null);
  return {
    gpu: llama ? llama.gpu : null,
    gpuFallback: gpuFallback ?? savedCpuOnly(),
    chatModel: chatModelId(),
    models: Object.entries(BUILTIN_MODELS).map(([id, spec]) => ({
      id,
      label: spec.label,
      role: spec.role,
      bytes: spec.bytes,
      downloaded: isDownloaded(id),
      fits: fitsInMemory(spec.bytes, os.totalmem()),
    })),
  };
}
