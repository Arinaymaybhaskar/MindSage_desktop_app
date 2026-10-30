import { describe, expect, it, vi, beforeEach } from "vitest";

// Enrichment on save (KAN-89): title, mood and tags in one schema call, then
// the summary in its own call, one after the other in the shared AI queue.
const generate = vi.hoisted(() => vi.fn());
const getJournalById = vi.hoisted(() => vi.fn());
const customFeelingWords = vi.hoisted(() => vi.fn(() => []));
vi.mock("../ai/client.js", () => ({
  generate,
  taskModel: (task) => `model-for-${task}`,
}));
const failedRows = vi.hoisted(() => ({ rows: [] }));
const writes = vi.hoisted(() => []);
vi.mock("../db/connection.js", () => ({
  db: {
    prepare: (sql) => ({
      run: (...args) => writes.push({ sql, args }),
      all: () => failedRows.rows,
    }),
  },
}));
const setSuggestedTags = vi.hoisted(() => vi.fn(() => null));
vi.mock("../db/index.js", () => ({
  default: { getJournalById, customFeelingWords, setSuggestedTags },
}));
// The ONNX models (KAN-388): not downloaded unless a test says so.
const classifyFeelings = vi.hoisted(() => vi.fn(async () => null));
const summarySupported = vi.hoisted(() => vi.fn(async () => null));
vi.mock("../ai/onnx.js", () => ({ classifyFeelings, summarySupported }));
vi.mock("../store.js", () => ({ modelStore: { get: vi.fn() } }));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
const ALL_ON = { enrich: true, feelings: true, suggestions: true };
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
const METADATA = '{"title":"A walk","mood":"Good","mood_tags":["Content"]}';
const SUMMARY = "The writer walked home in the rain and felt calm.";
const drained = () => background(() => {});

beforeEach(() => {
  generate.mockReset();
  getJournalById.mockReset().mockReturnValue(entry);
  getFeatures.mockReset().mockReturnValue(ALL_ON);
  classifyFeelings.mockReset().mockResolvedValue(null);
  summarySupported.mockReset().mockResolvedValue(null);
  setSuggestedTags.mockClear();
});

describe("the ONNX classifier and entailment gate (KAN-388)", () => {
  const completed = [];
  eventBus.on("journal:aiCompleted", (e) => completed.push(e.metadata));
  const failed = [];
  eventBus.on("ollama:summary-failed", (e) => failed.push(e.error));
  const saved = [];
  eventBus.on("ollama:summary-generated", (e) => saved.push(e.summary));

  it("takes the feeling words from the classifier, run before the chat model", async () => {
    classifyFeelings.mockImplementation(async () => {
      expect(generate).not.toHaveBeenCalled();
      return ["Hurt", "Lonely"];
    });
    generate
      .mockResolvedValueOnce('{"title":"A walk","mood":"Good"}')
      .mockResolvedValueOnce(SUMMARY);
    eventBus.emit("journal:created", { entry });
    await drained();
    // The chat model is not asked for feeling words the classifier gave.
    const { schema } = generate.mock.calls[0][1];
    expect(Object.keys(schema.properties)).toEqual(["title", "mood"]);
    expect(completed.at(-1)).toEqual({
      title: "A walk",
      mood_score: 4,
      mood_tags: ["Hurt", "Lonely"],
    });
  });

  it("still offers the classifier's words when no chat model can run", async () => {
    // The user ticks "Content" while the chat model is tried.
    getJournalById
      .mockReturnValueOnce(entry)
      .mockReturnValue({ ...entry, mood_tags: ["Content"] });
    classifyFeelings.mockResolvedValue(["Content", "Proud"]);
    generate.mockRejectedValue(new Error("The built-in AI is not downloaded"));
    eventBus.emit("journal:created", { entry });
    await drained();
    // Offered, not tagged (KAN-437); one already ticked is not offered again.
    expect(setSuggestedTags).toHaveBeenCalledWith(7, 1, ["Proud"]);
  });

  it("asks the chat model nothing when Enrich entries is off and the classifier ran", async () => {
    getFeatures.mockReturnValue({ ...ALL_ON, enrich: false });
    classifyFeelings.mockResolvedValue(["Proud"]);
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).not.toHaveBeenCalled();
    expect(completed.at(-1)).toEqual({ mood_tags: ["Proud"] });
  });

  it("writes a rejected summary once more, then holds it", async () => {
    classifyFeelings.mockResolvedValue([]);
    summarySupported.mockResolvedValue(false);
    generate
      .mockResolvedValueOnce('{"title":"A walk","mood":"Good"}')
      .mockResolvedValue(SUMMARY);
    const before = saved.length;
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).toHaveBeenCalledTimes(3); // metadata, then two drafts
    expect(saved.length).toBe(before);
    expect(failed.at(-1)).toMatch(/valid summary/);
  });

  it("saves the second draft when it passes the gate", async () => {
    classifyFeelings.mockResolvedValue([]);
    summarySupported.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    generate
      .mockResolvedValueOnce('{"title":"A walk","mood":"Good"}')
      .mockResolvedValueOnce(
        "The writer went skiing in the mountains with friends.",
      )
      .mockResolvedValueOnce(SUMMARY);
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(saved.at(-1)).toBe(SUMMARY);
  });
});

describe("AI feature switches (KAN-70, KAN-437)", () => {
  it("with Enrich entries off, asks for feeling words only and no summary", async () => {
    getFeatures.mockReturnValue({ ...ALL_ON, enrich: false });
    generate.mockResolvedValueOnce('{"mood_tags":["Content"]}');
    const completed = [];
    eventBus.on("journal:aiCompleted", (e) => completed.push(e.metadata));
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).toHaveBeenCalledTimes(1);
    const [prompt, opts] = generate.mock.calls[0];
    expect(Object.keys(opts.schema.properties)).toEqual(["mood_tags"]);
    expect(prompt).not.toMatch(/Choose a Mood|Create a Title/);
    expect(completed.at(-1)).toEqual({ mood_tags: ["Content"] });
  });

  it("with Suggest feelings off, sends no feeling word, the user's own included", async () => {
    getFeatures.mockReturnValue({ ...ALL_ON, feelings: false });
    customFeelingWords.mockClear();
    generate
      .mockResolvedValueOnce('{"title":"A walk","mood":"Good"}')
      .mockResolvedValueOnce(SUMMARY);
    eventBus.emit("journal:created", { entry });
    await drained();
    const [prompt, opts] = generate.mock.calls[0];
    expect(Object.keys(opts.schema.properties)).toEqual(["title", "mood"]);
    expect(prompt).not.toMatch(/Mood Tags|Playful/);
    expect(customFeelingWords).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(2); // the summary still runs
  });

  it("enqueues no title/mood/feelings job when both are off", async () => {
    getFeatures.mockReturnValue({ ...ALL_ON, enrich: false, feelings: false });
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).not.toHaveBeenCalled();
  });

  it("enqueues nothing with every feature off", async () => {
    getFeatures.mockReturnValue({
      enrich: false,
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
    getFeatures.mockReturnValue({ ...ALL_ON, enrich: false, feelings: false });
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

  it("offers the user's 50 most used own words in the prompt and enum (KAN-94)", async () => {
    const own = [{ name: "उदास", family: "Sad", uses: 3 }];
    customFeelingWords.mockReturnValueOnce(own);
    const { generateMetadata } = await import("./ollama.js");
    generate.mockResolvedValueOnce(
      '{"title":"A walk","mood":"Low","mood_tags":["उदास","Invented"]}',
    );
    const out = await generateMetadata("text", 7);
    expect(customFeelingWords).toHaveBeenLastCalledWith(7, 50);
    const [prompt, opts] = generate.mock.calls[0];
    expect(prompt).toContain("उदास");
    expect(opts.schema.properties.mood_tags.items.enum).toContain("उदास");
    expect(out.mood_tags).toEqual(["उदास"]);
  });

  it("does nothing for an entry moved to the Trash while it waited", async () => {
    getJournalById.mockReturnValue(null);
    eventBus.emit("journal:created", { entry });
    await drained();
    expect(generate).not.toHaveBeenCalled();
  });

  // KAN-393: left 'pending', a restored entry needed Cancel then Retry.
  it("marks the pending statuses failed when the entry went to the Trash", async () => {
    getJournalById.mockReturnValue(null);
    writes.length = 0;
    eventBus.emit("journal:created", { entry });
    await drained();
    const failed = writes.filter((w) => w.sql.includes("'failed'"));
    const sql = failed.map((w) => w.sql.replace(/\s+/g, " "));
    expect(sql).toEqual([
      expect.stringMatching(
        /SET ai_metadata_status = 'failed'.*AND ai_metadata_status = 'pending'/,
      ),
      expect.stringMatching(
        /SET ai_summary_status = 'failed'.*AND ai_summary_status = 'pending'/,
      ),
    ]);
    expect(failed.map((w) => w.args[1])).toEqual([entry.id, entry.id]);
  });
});

describe("backfill after setup (KAN-87)", () => {
  const failed = {
    ...entry,
    ai_metadata_status: "failed",
    ai_summary_status: "failed",
  };

  it("re-runs enrichment once for entries that failed while models were missing", async () => {
    failedRows.rows = [{ id: 1, user_id: 7 }];
    getJournalById.mockReturnValue(failed);
    generate.mockResolvedValueOnce(METADATA).mockResolvedValueOnce(SUMMARY);
    eventBus.emit("ai:models-ready");
    await drained();
    expect(generate).toHaveBeenCalledTimes(2);
    failedRows.rows = [];
  });

  it("tells the status card about each entry it works on (KAN-486)", async () => {
    const started = [];
    const off = (e) => started.push(e);
    eventBus.on("journal:aiStarted", off);
    eventBus.on("ollama:summary-started", off);
    failedRows.rows = [{ id: 1, user_id: 7 }];
    getJournalById.mockReturnValue(failed);
    generate.mockResolvedValueOnce(METADATA).mockResolvedValueOnce(SUMMARY);
    eventBus.emit("ai:models-ready");
    await drained();
    eventBus.off("journal:aiStarted", off);
    eventBus.off("ollama:summary-started", off);
    expect(started).toEqual([{ entryId: 1 }, { entryId: 1 }]);
    failedRows.rows = [];
  });

  // An import calls the backfill too (KAN-80); a job queued twice runs once.
  it("does nothing for an entry a previous backfill already filled", async () => {
    failedRows.rows = [{ id: 1, user_id: 7 }];
    getJournalById.mockReturnValue({
      ...failed,
      ai_metadata_status: "completed",
      ai_summary_status: "completed",
    });
    const { backfillEnrichment } = await import("./ollama.js");
    backfillEnrichment();
    await drained();
    expect(generate).not.toHaveBeenCalled();
    failedRows.rows = [];
  });
});

describe("entries left 'pending' by a close (KAN-491)", () => {
  it("turns stale pending rows into failed, skips the Trash, and retries them", async () => {
    writes.length = 0;
    failedRows.rows = [{ id: 1, user_id: 7 }];
    getJournalById.mockReturnValue({
      ...entry,
      ai_metadata_status: "failed",
      ai_summary_status: "failed",
    });
    generate.mockResolvedValueOnce(METADATA).mockResolvedValueOnce(SUMMARY);
    const { requeueInterruptedEnrichment } = await import("./ollama.js");
    requeueInterruptedEnrichment();
    await drained();
    expect(writes.slice(0, 2).map((w) => w.sql)).toEqual([
      expect.stringMatching(
        /ai_metadata_status = 'failed'.*is_deleted = 0 AND ai_metadata_status = 'pending'/s,
      ),
      expect.stringMatching(
        /ai_summary_status = 'failed'.*is_deleted = 0 AND ai_summary_status = 'pending'/s,
      ),
    ]);
    expect(generate).toHaveBeenCalledTimes(2);
    failedRows.rows = [];
  });
});
