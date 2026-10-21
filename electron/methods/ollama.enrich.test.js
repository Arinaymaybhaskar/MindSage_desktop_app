import { describe, expect, it, vi, beforeEach } from "vitest";

// Enrichment on save (KAN-89): title, mood and tags in one schema call, then
// the summary in its own call, one after the other in the shared AI queue.
const generate = vi.hoisted(() => vi.fn());
const getJournalById = vi.hoisted(() => vi.fn());
vi.mock("../ai/client.js", () => ({
  generate,
  taskModel: (task) => `model-for-${task}`,
}));
const failedRows = vi.hoisted(() => ({ rows: [] }));
vi.mock("../db/connection.js", () => ({
  db: { prepare: () => ({ run: () => {}, all: () => failedRows.rows }) },
}));
vi.mock("../db/index.js", () => ({ default: { getJournalById } }));
vi.mock("../store.js", () => ({ modelStore: { get: vi.fn() } }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
const ALL_ON = {
  title: true,
  summary: true,
  mood: true,
  feelings: true,
  suggestions: true,
};
const getFeatures = vi.hoisted(() => vi.fn());
vi.mock("../ai/features.js", async (orig) => ({
  ...(await orig()),
  getFeatures,
}));
vi.mock("electron-store", () => ({ default: class {} }));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

await import("./ollama.js");
const { eventBus } = await import("../eventBus.js");
const { background, foreground } = await import("../ai/queue.js");

const entry = {
  id: 1,
  user_id: 7,
  title: "",
  content: Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "),
};
const METADATA = '{"title":"A walk","mood_score":4,"mood_tags":["Content"]}';
const SUMMARY = "The writer walked home in the rain and felt calm.";
const drained = () => background(() => {});

beforeEach(() => {
  generate.mockReset();
  getJournalById.mockReset().mockReturnValue(entry);
  getFeatures.mockReset().mockReturnValue(ALL_ON);
});

describe("AI feature switches (KAN-70)", () => {
  it("enqueues no summary job when summary is off", async () => {
    getFeatures.mockReturnValue({ ...ALL_ON, summary: false });
    generate.mockResolvedValueOnce(METADATA);
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1].schema).toBeDefined();
  });

  it("enqueues no title/mood/feelings job when all three are off", async () => {
    getFeatures.mockReturnValue({
      ...ALL_ON,
      title: false,
      mood: false,
      feelings: false,
    });
    generate.mockResolvedValueOnce(SUMMARY);
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1].schema).toBeUndefined();
  });

  it("enqueues nothing with every feature off", async () => {
    getFeatures.mockReturnValue({
      title: false,
      summary: false,
      mood: false,
      feelings: false,
      suggestions: false,
    });
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).not.toHaveBeenCalled();
  });

  it("skips a queued job whose switch went off while it waited", async () => {
    let endAsk;
    const ask = foreground(() => new Promise((r) => (endAsk = r)));
    eventBus.emit("journal:created", { entry });
    getFeatures.mockReturnValue({
      ...ALL_ON,
      title: false,
      mood: false,
      feelings: false,
      summary: false,
    });
    endAsk();
    await ask;
    await drained();
    expect(generate).not.toHaveBeenCalled();
  });

  it("gives no ghost-text suggestion when suggestions are off", async () => {
    getFeatures.mockReturnValue({ ...ALL_ON, suggestions: false });
    const { generateSuggestion } = await import("./ollama.js");
    expect(await generateSuggestion("Today I")).toBe("");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("enrichment on save", () => {
  it("asks for title, mood and tags first, then the summary, never both at once", async () => {
    let finishMetadata;
    generate.mockImplementationOnce(
      () => new Promise((r) => (finishMetadata = () => r(METADATA))),
    );
    generate.mockResolvedValueOnce(SUMMARY);
    const summaries = [];
    eventBus.on("ollama:summary-generated", (e) => summaries.push(e.summary));

    eventBus.emit("journal:created", { entry });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0][1]).toMatchObject({
      model: "model-for-metadata",
      schema: expect.any(Object),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(generate).toHaveBeenCalledTimes(1);

    finishMetadata();
    await drained();
    expect(generate.mock.calls[1][1]).toMatchObject({
      model: "model-for-summary",
    });
    expect(generate.mock.calls[1][1].schema).toBeUndefined();
    expect(summaries).toEqual([SUMMARY]);
  });

  it("waits for a running Ask before starting", async () => {
    let endAsk;
    const ask = foreground(() => new Promise((r) => (endAsk = r)));
    generate.mockResolvedValueOnce(METADATA).mockResolvedValueOnce(SUMMARY);
    eventBus.emit("journal:created", { entry });
    await new Promise((r) => setTimeout(r, 10));
    expect(generate).not.toHaveBeenCalled();
    endAsk();
    await ask;
    await drained();
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an entry moved to the Trash while it waited", async () => {
    getJournalById.mockReturnValue(null);
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("backfill after setup (KAN-87)", () => {
  it("re-runs enrichment once for entries that failed while models were missing", async () => {
    failedRows.rows = [
      {
        id: 1,
        user_id: 7,
        ai_metadata_status: "failed",
        ai_summary_status: "failed",
      },
    ];
    generate.mockResolvedValueOnce(METADATA).mockResolvedValueOnce(SUMMARY);
    eventBus.emit("ai:models-ready");
    await drained();
    expect(generate).toHaveBeenCalledTimes(2);
    failedRows.rows = [];
  });
});
