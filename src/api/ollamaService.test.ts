import { describe, it, expect, beforeEach, vi } from "vitest";
import { ollamaService, OllamaListError } from "./ollamaService";

// getModels turns the `ollama:models` error shape into something the Models
// screen can name (KAN-369), while a signed-out answer stays an empty list.
const invoke = vi.fn();

beforeEach(() => {
  invoke.mockReset();
  // @ts-expect-error minimal stub of the preload bridge for tests
  globalThis.window = { electron: { ipcRenderer: { invoke } } };
});

describe("ollamaService.getModels", () => {
  it("returns the rows from ollama:models", async () => {
    const rows = [{ name: "m:1", size: "abc", modified: "1.5 GB" }];
    invoke.mockResolvedValue(rows);
    await expect(ollamaService.getModels()).resolves.toEqual(rows);
    expect(invoke).toHaveBeenCalledWith("ollama:models");
  });

  it("rejects with the reason when Ollama is not responding", async () => {
    invoke.mockResolvedValue({
      error: "Ollama is not responding.",
      reason: "timeout",
    });
    const err = await ollamaService.getModels().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OllamaListError);
    expect(err).toMatchObject({
      message: "Ollama is not responding.",
      reason: "timeout",
    });
  });

  it("treats a signed-out answer as an empty list", async () => {
    invoke.mockResolvedValue({ error: "Not signed in" });
    await expect(ollamaService.getModels()).resolves.toEqual([]);
  });
});
