import { describe, expect, it } from "vitest";
import { BUILTIN_MODELS } from "./models.js";
import {
  deleteImpact,
  downloadSpace,
  downloadWarning,
  formatGB,
  isLockedError,
  modelBars,
  recommend,
} from "./picker.js";

const GiB = 2 ** 30;

describe("recommendation from memory", () => {
  it("8 GB: Qwen 1.5B for summaries only, feelings left to the classifier", () => {
    expect(recommend(7.8 * GiB)).toEqual({
      chat: "qwen-2.5-1.5b",
      metadata: null,
      summary: "qwen-2.5-1.5b",
      feelings: "classifier",
    });
  });

  it.each([15.8, 31.8])(
    "%s GB: 3B for mood and tags, Qwen for summaries",
    (gb) => {
      const rec = recommend(gb * GiB);
      expect(rec.metadata).toBe("llama-3.2-3b");
      expect(rec.summary).toBe("qwen-2.5-1.5b");
      expect(rec.chat).toBe("llama-3.2-3b");
      expect(rec.feelings).toBe("chat-model");
    },
  );

  it("never recommends the 8B", () => {
    for (const gb of [4, 8, 16, 32, 64]) {
      expect(Object.values(recommend(gb * GiB))).not.toContain("llama-3.1-8b");
    }
  });
});

describe("download warning", () => {
  it("warns for a model that will not fit, not for one that does", () => {
    expect(downloadWarning("llama-3.1-8b", 7.8 * GiB)).toMatch(/Llama 3.1 8B/);
    expect(downloadWarning("llama-3.1-8b", 32 * GiB)).toBeNull();
    expect(downloadWarning("llama-3.2-3b", 8 * GiB)).toBeNull();
  });
});

describe("model bars", () => {
  it("hides speed when the probe failed", () => {
    for (const row of modelBars(16 * GiB, null)) {
      expect(row.tokensPerSecond).toBeNull();
      expect(row.speedShare).toBeNull();
      expect(row.memoryShare).toBeGreaterThan(0);
    }
  });

  it("scales unprobed models from the measured one and flags the 8B on request", () => {
    const rows = modelBars(16 * GiB, {
      id: "llama-3.2-3b",
      tokensPerSecond: 20,
    });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by["llama-3.2-3b"].speedMeasured).toBe(true);
    expect(by["qwen-2.5-1.5b"].speedMeasured).toBe(false);
    expect(by["qwen-2.5-1.5b"].tokensPerSecond).toBeGreaterThan(20);
    expect(by["qwen-2.5-1.5b"].speedShare).toBe(1);
    expect(by["llama-3.1-8b"].tokensPerSecond).toBeLessThan(20);
    expect(by["llama-3.1-8b"].onRequest).toBe(true);
    expect(by["llama-3.1-8b"].bytes).toBe(BUILTIN_MODELS["llama-3.1-8b"].bytes);
    expect(by["llama-3.2-3b"].recommendedFor).toEqual(["chat", "metadata"]);
  });
});

describe("download and delete dialogs", () => {
  it("formats sizes in GB with one decimal", () => {
    expect(formatGB(2019377696)).toBe("1.9 GB");
    expect(formatGB(4920739232)).toBe("4.6 GB");
  });

  it("a cut download only needs the rest of the file", () => {
    const { bytes } = BUILTIN_MODELS["llama-3.2-3b"];
    expect(downloadSpace("llama-3.2-3b", bytes, 0).short).toBe(0);
    expect(downloadSpace("llama-3.2-3b", bytes - 10, 0).short).toBe(10);
    expect(downloadSpace("llama-3.2-3b", 100, bytes - 100).short).toBe(0);
  });

  it("deleting the chat model in use names the stand-in, or turns chat off", () => {
    const both = (m) => m === "llama-3.2-3b" || m === "qwen-2.5-1.5b";
    expect(deleteImpact("llama-3.2-3b", "llama-3.2-3b", both)).toMatchObject({
      inUse: true,
      alternative: "qwen-2.5-1.5b",
    });
    const alone = deleteImpact(
      "llama-3.2-3b",
      "llama-3.2-3b",
      (m) => m === "llama-3.2-3b",
    );
    expect(alone).toMatchObject({ inUse: true, alternative: null });
    expect(alone.warning).toMatch(/turn off/);
  });

  it("a model not in use deletes without a warning", () => {
    expect(deleteImpact("qwen-2.5-1.5b", "llama-3.2-3b", () => true)).toEqual({
      inUse: false,
    });
  });

  it("the embedding model is always in use: search depends on it", () => {
    expect(deleteImpact("nomic-embed-text-v1.5", "x", () => true).inUse).toBe(
      true,
    );
  });

  it("a locked file is a retry-later error", () => {
    expect(isLockedError({ code: "EBUSY" })).toBe(true);
    expect(isLockedError({ code: "ENOENT" })).toBe(false);
  });
});
