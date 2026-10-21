import { beforeEach, describe, expect, it, vi } from "vitest";

const downloaded = vi.hoisted(() => new Set());
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../ai/llama.js", () => ({
  isDownloaded: (id) => downloaded.has(id),
  modelPath: (id) => `/models/${id}.bin`,
}));

const { startLiveTranscription, transcribeAudioBlob, voiceModelArgs } =
  await import("./whisper.js");

beforeEach(() => downloaded.clear());

describe("voice model (KAN-91)", () => {
  it("has no model before the first download", async () => {
    expect(voiceModelArgs()).toBeNull();
    expect(startLiveTranscription({})).toEqual({ needsModel: true });
    await expect(transcribeAudioBlob("a.wav", {})).rejects.toThrow(
      /not downloaded/,
    );
  });

  it("runs English-only base.en without a language flag", () => {
    downloaded.add("whisper-base-en");
    expect(voiceModelArgs()).toEqual([
      "--model",
      "/models/whisper-base-en.bin",
    ]);
  });

  it("prefers small and lets it detect the language", () => {
    downloaded.add("whisper-base-en").add("whisper-small");
    expect(voiceModelArgs()).toEqual([
      "--model",
      "/models/whisper-small.bin",
      "-l",
      "auto",
    ]);
  });
});
