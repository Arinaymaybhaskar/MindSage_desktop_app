import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The built-in provider against a fake node-llama-cpp. Its GPU build can be
// made to fail a model load, as a crashing driver does; its CPU build works.
const fake = vi.hoisted(() => ({
  gpuBroken: false,
  disposedOnce: false, // the next load fails as if a restart disposed the engine
  fileBroken: false, // every load fails, on any build, as a damaged file does
  cuda: false, // "auto" picks the CUDA build, as with a downloaded engine
  cudaBroken: false,
  gpuAsked: [], // the gpu option of every getLlama call
  totalmem: 64 * 2 ** 30,
  gate: null, // a promise a chat prompt waits on
  models: [],
}));
const store = vi.hoisted(() => new Map());
vi.mock("../store.js", () => ({
  modelStore: {
    get: (k) => store.get(k),
    set: (k, v) => store.set(k, v),
    delete: (k) => store.delete(k),
  },
}));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("node:os", async (orig) => {
  const real = (await orig()).default;
  return { default: { ...real, totalmem: () => fake.totalmem } };
});
vi.mock("node-llama-cpp", () => {
  class InsufficientMemoryError extends Error {}
  class LlamaChatSession {
    async prompt(_text, { onTextChunk }) {
      await fake.gate;
      onTextChunk("cal");
      onTextChunk("m");
      return "calm";
    }
    dispose() {}
  }
  const getLlama = async ({ gpu }) => {
    fake.gpuAsked.push(gpu);
    const built =
      gpu === false ? false : fake.cuda && gpu === "auto" ? "cuda" : "vulkan";
    return engineFor(built);
  };
  const engineFor = (gpu) => ({
    gpu,
    dispose: async () => {},
    loadModel: async () => {
      if (fake.disposedOnce) {
        fake.disposedOnce = false;
        throw new Error("Object is disposed");
      }
      if (fake.fileBroken) throw new Error("Failed to load model");
      if (gpu === "cuda" && fake.cudaBroken)
        throw new Error("cudaErrorNoDevice");
      if (gpu !== false && fake.gpuBroken) throw new Error("vk::DeviceLost");
      const model = {
        gpuLayers: gpu === false ? 0 : 33,
        dispose: vi.fn(async () => {}),
        tokenize: (t) => [...t],
        createContext: async () => ({
          contextSize: 4096,
          getSequence: () => ({}),
        }),
        createEmbeddingContext: async () => ({
          getEmbeddingFor: async () => ({ vector: [0.5, 0.5] }),
        }),
      };
      fake.models.push(model);
      return model;
    },
  });
  return { getLlama, InsufficientMemoryError, LlamaChatSession };
});

const { BUILTIN_MODELS } = await import("./models.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-llama-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Magic, version 3, one tensor, no keys: what checkGguf needs to see.
const header = Buffer.alloc(24);
header.write("GGUF");
header.writeUInt32LE(3, 4);
header.writeBigUInt64LE(1n, 8);
/** A file of the model's exact size; `zeros` leaves out the GGUF header. */
function placeModel(id, { zeros = false } = {}) {
  const fd = fs.openSync(path.join(dir, BUILTIN_MODELS[id].file), "w");
  fs.ftruncateSync(fd, BUILTIN_MODELS[id].bytes);
  if (!zeros) fs.writeSync(fd, header, 0, header.length, 0);
  fs.closeSync(fd);
}
for (const id of ["qwen-2.5-1.5b", "nomic-embed-text-v1.5"]) placeModel(id);

/** A fresh module per test: engine state lives in module scope. */
async function freshEngine() {
  vi.resetModules();
  const llama = await import("./llama.js");
  llama.setModelsDir(dir);
  return llama;
}

beforeEach(() => {
  store.clear();
  Object.assign(fake, {
    gpuBroken: false,
    disposedOnce: false,
    fileBroken: false,
    cuda: false,
    cudaBroken: false,
    gpuAsked: [],
    totalmem: 64 * 2 ** 30,
    gate: null,
    models: [],
  });
});

describe("built-in engine", () => {
  it("reports a model that is not downloaded as unavailable, not as a failure", async () => {
    const llama = await freshEngine();
    await expect(
      llama.generate("hi", { model: "llama-3.2-3b" }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("runs each enrichment task on its own model, or the chat model when it is missing", async () => {
    store.set("builtinModels", { chat: "qwen-2.5-1.5b" });
    const llama = await freshEngine();
    expect(llama.taskModelId("summary")).toBe("qwen-2.5-1.5b");
    // The 3B is not downloaded here.
    expect(llama.taskModelId("metadata")).toBe("qwen-2.5-1.5b");
    fake.totalmem = 2 * 2 ** 30; // Qwen no longer fits either
    store.set("builtinModels", { chat: "qwen-2.5-1.5b" });
    expect(llama.taskModelId("summary")).toBe("qwen-2.5-1.5b");
  });

  it("falls back to the recommendation when the chosen model is not on disk", async () => {
    store.set("builtinModels", { chat: "llama-3.1-8b" }); // deleted or never downloaded
    const llama = await freshEngine();
    expect(llama.chatModelId()).toBe("llama-3.2-3b"); // 64 GB default
  });

  it("streams on the GPU and clears the crash marker once a call worked", async () => {
    const llama = await freshEngine();
    const seen = [];
    const answer = await llama.generate("hi", {
      model: "qwen-2.5-1.5b",
      onToken: (_f, full) => seen.push(full),
    });
    expect(answer).toBe("calm");
    expect(seen).toEqual(["cal", "calm"]);
    expect((await llama.status()).gpu).toBe("vulkan");
    expect(store.has("builtinGpuPending")).toBe(false);
  });

  it("falls back to the CPU when the GPU fails a load, and remembers it", async () => {
    fake.gpuBroken = true;
    const llama = await freshEngine();
    expect(await llama.generate("hi", { model: "qwen-2.5-1.5b" })).toBe("calm");
    const status = await llama.status();
    expect(status.gpu).toBe(false);
    expect(status.gpuFallback).toMatch(/DeviceLost/);
    expect(store.get("builtinCpuOnly").reason).toMatch(/DeviceLost/);
  });

  it("does not count a zero-filled file of the right size as downloaded (KAN-492)", async () => {
    const llama = await freshEngine();
    expect(llama.isDownloaded("qwen-2.5-1.5b")).toBe(true);
    placeModel("qwen-2.5-1.5b", { zeros: true });
    try {
      expect(llama.isDownloaded("qwen-2.5-1.5b")).toBe(false);
      await expect(
        llama.generate("hi", { model: "qwen-2.5-1.5b" }),
      ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
      expect(fake.gpuAsked).toEqual([]); // never handed to the engine
    } finally {
      placeModel("qwen-2.5-1.5b");
    }
  });

  it("does not pin the CPU or skip CUDA for a file no build can load (KAN-492)", async () => {
    fake.fileBroken = true;
    const llama = await freshEngine();
    await expect(
      llama.generate("hi", { model: "qwen-2.5-1.5b" }),
    ).rejects.toThrow(/Failed to load model/);
    expect(store.has("builtinCpuOnly")).toBe(false);
    expect((await llama.status()).gpuFallback).toBe(null);
    fake.fileBroken = false;
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    expect((await llama.status()).gpu).toBe("vulkan"); // the GPU again

    fake.fileBroken = true;
    fake.cuda = true;
    const cuda = await freshEngine();
    await expect(
      cuda.generate("hi", { model: "qwen-2.5-1.5b" }),
    ).rejects.toThrow(/Failed to load model/);
    expect(store.has("builtinCudaOff")).toBe(false);
    expect(store.has("builtinCpuOnly")).toBe(false);
  });

  it("does not pin the CPU when a restart disposed the engine mid-load (KAN-489)", async () => {
    fake.disposedOnce = true;
    const llama = await freshEngine();
    expect(await llama.generate("hi", { model: "qwen-2.5-1.5b" })).toBe("calm");
    expect((await llama.status()).gpu).toBe("vulkan");
    expect(store.has("builtinCpuOnly")).toBe(false);
  });

  it("never takes a restart for a GPU crash, however often it repeats (KAN-489)", async () => {
    store.set("builtinModels", { chat: "qwen-2.5-1.5b" }); // restart reloads it
    const llama = await freshEngine();
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    await llama.restart();
    // The restart's own call proved the new engine and cleared the marker.
    expect(store.has("builtinGpuPending")).toBe(false);
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    await llama.restart();
    expect(store.has("builtinCpuOnly")).toBe(false);
    expect((await llama.status()).gpu).toBe("vulkan");
    expect(fake.gpuAsked).toEqual(["auto", "auto", "auto"]);
  });

  it("does not read a marker left by a disposed engine as a crash (KAN-489)", async () => {
    store.set("builtinModels", { chat: "qwen-2.5-1.5b" });
    const llama = await freshEngine();
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    store.set("builtinGpuPending", true); // a restart landed before a call proved the new engine
    await llama.restart();
    expect(store.has("builtinCpuOnly")).toBe(false);
    expect((await llama.status()).gpu).toBe("vulkan");
  });

  it("tries the GPU again once the CPU-only flag is a week old", async () => {
    const day = 24 * 60 * 60 * 1000;
    store.set("builtinCpuOnly", { reason: "old", at: Date.now() - 8 * day });
    const llama = await freshEngine();
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    expect((await llama.status()).gpu).toBe("vulkan");
    expect(store.has("builtinCpuOnly")).toBe(false);
    const { log } = await import("../log.js");
    expect(log.info).toHaveBeenCalledWith(
      "Built-in AI model loaded",
      expect.objectContaining({ gpuLayers: 33, contextSize: 4096 }),
    );

    // A flag saved before it could expire is a bare string: the GPU again.
    store.set("builtinCpuOnly", "GPU failed");
    expect((await (await freshEngine()).status()).gpuFallback).toBe(null);

    // A recent one still holds.
    store.set("builtinCpuOnly", { reason: "new", at: Date.now() - day });
    const pinned = await freshEngine();
    await pinned.generate("hi", { model: "qwen-2.5-1.5b" });
    expect((await pinned.status()).gpu).toBe(false);
  });

  it("starts on the CPU, with a notice, after the GPU took the app down", async () => {
    // What a crash mid-load leaves behind: the marker, never cleared.
    store.set("builtinGpuPending", true);
    const llama = await freshEngine();
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    const status = await llama.status();
    expect(status.gpu).toBe(false);
    expect(status.gpuFallback).toMatch(/GPU stopped MindSage/);

    // And on the launch after that, before anything runs.
    const next = await freshEngine();
    expect((await next.status()).gpuFallback).toMatch(/GPU stopped MindSage/);
  });

  it("moves to Vulkan, not the CPU, when CUDA fails a load (KAN-434)", async () => {
    fake.cuda = true;
    fake.cudaBroken = true;
    const llama = await freshEngine();
    expect(await llama.generate("hi", { model: "qwen-2.5-1.5b" })).toBe("calm");
    expect((await llama.status()).gpu).toBe("vulkan");
    expect(store.get("builtinCudaOff")).toMatch(/cudaErrorNoDevice/);
    expect(store.has("builtinCpuOnly")).toBe(false);
    expect(fake.gpuAsked.at(-1)).toEqual({ type: "auto", exclude: ["cuda"] });
  });

  it("starts on Vulkan after CUDA took the app down", async () => {
    fake.cuda = true;
    store.set("builtinGpuPending", "cuda");
    const llama = await freshEngine();
    await llama.generate("hi", { model: "qwen-2.5-1.5b" });
    expect((await llama.status()).gpu).toBe("vulkan");
    expect(store.get("builtinCudaOff")).toMatch(/CUDA engine stopped/);
    expect(store.has("builtinCpuOnly")).toBe(false);
  });

  it("counts the CUDA engine as downloaded only once it is unpacked", async () => {
    const llama = await freshEngine();
    expect(llama.isDownloaded("cuda-engine")).toBe(false);
    const unpacked = path.join(dir, "win-x64-cuda-3.22.1");
    fs.mkdirSync(path.join(unpacked, "dist"), { recursive: true });
    fs.mkdirSync(path.join(unpacked, "bins", "win-x64-cuda"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(unpacked, "dist", "index.js"), "");
    expect(llama.isDownloaded("cuda-engine")).toBe(false);
    fs.writeFileSync(
      path.join(unpacked, "bins", "win-x64-cuda", "llama-addon.node"),
      "",
    );
    expect(llama.isDownloaded("cuda-engine")).toBe(true);
    fs.rmSync(unpacked, { recursive: true });
  });

  it("a clean quit is not taken for a GPU crash", async () => {
    const llama = await freshEngine();
    fake.gate = new Promise(() => {}); // a call still running at quit
    llama.generate("hi", { model: "qwen-2.5-1.5b" }).catch(() => {});
    await vi.waitFor(() => expect(store.get("builtinGpuPending")).toBe(true));
    llama.shutdown().catch(() => {});
    expect(store.has("builtinGpuPending")).toBe(false);
  });

  it("unloads a model for another only after its running call finished", async () => {
    // Room for either model alone, not both.
    fake.totalmem = 3.6 * 2 ** 30;
    const llama = await freshEngine();
    let release;
    fake.gate = new Promise((r) => (release = r));
    const running = llama.generate("hi", { model: "qwen-2.5-1.5b" });
    await vi.waitFor(() => expect(fake.models).toHaveLength(1));
    const chatModel = fake.models[0];

    const queued = llama.generate("again", { model: "qwen-2.5-1.5b" });
    const embedding = llama.embed("text");
    await new Promise((r) => setTimeout(r, 20));
    expect(chatModel.dispose).not.toHaveBeenCalled();

    release();
    expect(await running).toBe("calm");
    // A call still queued when the unload began is retryable, not a failure.
    await expect(queued).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(await embedding).toEqual([0.5, 0.5]);
    expect(chatModel.dispose).toHaveBeenCalledTimes(1);

    // Asking for the chat model again swaps once more, no loop.
    expect(await llama.generate("third", { model: "qwen-2.5-1.5b" })).toBe(
      "calm",
    );
    expect(fake.models).toHaveLength(3);
    expect(fake.models[1].dispose).toHaveBeenCalledTimes(1);
  });

  it("waits for a model still loading before unloading everything", async () => {
    const llama = await freshEngine();
    const answer = llama.generate("hi", { model: "qwen-2.5-1.5b" });
    await llama.unloadAll();
    // The load finished first, then was freed; the call it carried got a
    // retryable answer or completed, never a crash on a freed model.
    expect(fake.models[0].dispose).toHaveBeenCalledTimes(1);
    await answer.catch((err) => expect(err.code).toBe("AI_UNAVAILABLE"));
  });
});
