import { describe, expect, it, vi, beforeEach } from "vitest";

// Enrichment on save (KAN-89): title, mood and tags in one schema call, then
// the summary in its own call, one after the other in the shared AI queue.
const generate = vi.hoisted(() => vi.fn());
const getJournalById = vi.hoisted(() => vi.fn());
vi.mock("../ai/client.js", () => ({
  generate,
  taskModel: (task) => `model-for-${task}`,
}));
vi.mock("../db/connection.js", () => ({
  db: { prepare: () => ({ run: () => {} }) },
}));
vi.mock("../db/index.js", () => ({ default: { getJournalById } }));
vi.mock("../store.js", () => ({ modelStore: { get: vi.fn() } }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
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
