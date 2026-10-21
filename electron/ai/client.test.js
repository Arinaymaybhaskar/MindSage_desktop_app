import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = {};
vi.mock("../store.js", () => ({ modelStore: { get: (key) => settings[key] } }));
vi.mock("./llama.js", () => ({ generate: vi.fn(async () => "built-in") }));
vi.mock("./ollama.js", () => ({ generate: vi.fn(async () => "ollama") }));

const { activeProvider, generate } = await import("./client.js");

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
});

describe("AI provider choice", () => {
  it("gives a new install the built-in engine, with no Ollama needed", async () => {
    settings.selectedModels = {};
    expect(activeProvider()).toBe("builtin");
    expect(await generate("hi")).toBe("built-in");
  });

  it("keeps Ollama for an install that already picked Ollama models", () => {
    settings.selectedModels = { chat: "llama3.2:latest" };
    expect(activeProvider()).toBe("ollama");
  });

  it("follows an explicit choice either way", async () => {
    settings.selectedModels = { chat: "llama3.2:latest" };
    settings.aiProvider = "builtin";
    expect(activeProvider()).toBe("builtin");
    settings.aiProvider = "ollama";
    expect(await generate("hi")).toBe("ollama");
  });
});
