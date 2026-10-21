import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The real llama.js decides whether its models are on disk; only its engine
// calls and Ollama's are replaced.
const settings = {};
vi.mock("../store.js", () => ({
  modelStore: { get: (key) => settings[key], set: vi.fn(), delete: vi.fn() },
}));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./ollama.js", () => ({ generate: vi.fn(async () => "ollama") }));

const { activeProvider, generate } = await import("./client.js");
const builtin = await import("./llama.js");
const { BUILTIN_MODELS, EMBED_MODEL } = await import("./models.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-client-"));
builtin.setModelsDir(dir);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A file of the model's exact size, as a verified download leaves it. */
function placeModel(id) {
  const fd = fs.openSync(builtin.modelPath(id), "w");
  fs.ftruncateSync(fd, BUILTIN_MODELS[id].bytes);
  fs.closeSync(fd);
}

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
});

describe("AI provider choice", () => {
  it("keeps Ollama on a fresh install until the built-in models are on disk", async () => {
    expect(activeProvider()).toBe("ollama");
    expect(await generate("hi")).toBe("ollama");
  });

  it("keeps Ollama for an install that picked Ollama models", () => {
    settings.selectedModels = { chat: "llama3.2:latest" };
    expect(activeProvider()).toBe("ollama");
  });

  it("uses the built-in engine once its chat and embedding models are downloaded", () => {
    placeModel(builtin.chatModelId());
    expect(activeProvider()).toBe("ollama"); // the embedding model is missing
    placeModel(EMBED_MODEL);
    expect(activeProvider()).toBe("builtin");
  });

  it("does not count a partial or wrong-size file as downloaded", () => {
    fs.writeFileSync(builtin.modelPath(builtin.chatModelId()), "x");
    placeModel(EMBED_MODEL);
    expect(activeProvider()).toBe("ollama");
  });

  it("follows an explicit choice either way", () => {
    settings.aiProvider = "builtin";
    expect(activeProvider()).toBe("builtin");
    placeModel(builtin.chatModelId());
    placeModel(EMBED_MODEL);
    settings.aiProvider = "ollama";
    expect(activeProvider()).toBe("ollama");
  });
});
