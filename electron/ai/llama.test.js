import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The built-in provider against a fake node-llama-cpp whose GPU build fails
// to load a model, as a crashing driver does, and whose CPU build works.
const dir = vi.hoisted(() => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  return fs.mkdtempSync(path.join(os.tmpdir(), "ms-llama-"));
});
vi.mock("electron", () => ({ app: { getPath: () => dir } }));
vi.mock("../store.js", () => ({ modelStore: { get: () => undefined } }));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("node-llama-cpp", () => {
  class InsufficientMemoryError extends Error {}
  class LlamaChatSession {
    async prompt(_text, { onTextChunk }) {
      onTextChunk("cal");
      onTextChunk("m");
      return "calm";
    }
    dispose() {}
  }
  const getLlama = async ({ gpu }) => ({
    gpu: gpu === false ? false : "vulkan",
    dispose: async () => {},
    loadModel: async () => {
      if (gpu !== false) throw new Error("vk::DeviceLostError");
      return {
        dispose: async () => {},
        createContext: async () => ({ getSequence: () => ({}) }),
      };
    },
  });
  return { getLlama, InsufficientMemoryError, LlamaChatSession };
});

const llama = await import("./llama.js");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("built-in engine", () => {
  it("reports a model that is not downloaded as unavailable, not as a failure", async () => {
    await expect(
      llama.generate("hi", { model: "llama-3.2-3b" }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("falls back to the CPU when the GPU fails, streams, and says so in the status", async () => {
    fs.mkdirSync(path.join(dir, "models"), { recursive: true });
    fs.writeFileSync(llama.modelPath("qwen-2.5-1.5b"), "gguf");
    const tokens = [];
    const answer = await llama.generate("hi", {
      model: "qwen-2.5-1.5b",
      onToken: (_fragment, full) => tokens.push(full),
    });
    expect(answer).toBe("calm");
    expect(tokens).toEqual(["cal", "calm"]);
    const status = await llama.status();
    expect(status.gpu).toBe(false);
    expect(status.gpuFallback).toMatch(/DeviceLost/);
  });
});
