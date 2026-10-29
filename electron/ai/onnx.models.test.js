// @vitest-environment node
// (jsdom's typed arrays are not the ones onnxruntime-node checks against.)
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_MODELS } from "./models.js";

// The real ONNX models through ai/onnx.js (KAN-388). Opt-in: set
// MS_ONNX_MODELS_DIR to a folder holding the three ONNX files under their
// BUILTIN_MODELS names; without it this file is skipped (CI has no models).
const dir = process.env.MS_ONNX_MODELS_DIR;
vi.mock("./llama.js", () => ({
  isDownloaded: () => true,
  modelPath: (id) => path.join(dir, BUILTIN_MODELS[id].file),
}));
vi.mock("../log.js", () => ({ log: { warn: vi.fn() } }));

describe.skipIf(!dir)("the ONNX models, for real", () => {
  it("reads feelings from an entry", async () => {
    const { classifyFeelings } = await import("./onnx.js");
    expect(
      await classifyFeelings(
        "I miss my dad so much. The house feels empty since the funeral.",
      ),
    ).toContain("Hurt");
    expect(
      await classifyFeelings("Went for groceries, then did laundry."),
    ).toEqual([]);
  });

  it("passes a faithful summary and stops an invented one", async () => {
    const { summarySupported } = await import("./onnx.js");
    const entry =
      "Today I walked to the lake with Priya. It rained the whole way, but we laughed a lot. Afterwards I felt calm and a bit tired.";
    expect(
      await summarySupported(
        entry,
        "The writer walked to a lake with Priya. Afterwards the writer felt calm.",
      ),
    ).toBe(true);
    expect(
      await summarySupported(
        entry,
        "The writer walked to a lake with Priya. The writer went skiing.",
      ),
    ).toBe(false);
  });
});
