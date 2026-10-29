import { describe, it, expect, vi, beforeEach } from "vitest";
import { IndexUnavailableError } from "../services/searchIndex.js";

// chat.js reaches the database, Ollama and Qdrant; all three are replaced so
// handleUserMessage can run to the point where Ask searches the journal.
const db = {
  AddChat: vi.fn(async () => ({ id: 11 })),
  addMessage: vi.fn(async () => ({ id: 21 })),
  addAIMessage: vi.fn(),
  isOwnChat: vi.fn((userId, chatId) => chatId !== 99),
  recentMessages: vi.fn(() => []),
};
vi.mock("../db/index.js", () => ({ default: db }));

// The first model call plans; this default plan is not one (an old-style
// reply), which Ask treats as "search the question". The streamed call (with
// onToken) answers with whatever a test put in `answer`.
let answer = "";
const ai = {
  embed: vi.fn(async () => [0.1, 0.2]),
  generate: vi.fn(async (_prompt, { onToken } = {}) =>
    onToken ? answer : JSON.stringify({ requires_context: true }),
  ),
};
vi.mock("../ai/client.js", () => ai);

const semanticSearch = vi.fn();
vi.mock("./search.js", () => ({ semanticSearch }));
const session = vi.hoisted(() => ({ userId: 7 }));
vi.mock("../session.js", () => ({ currentUserId: () => session.userId }));
// The real tools, watched; the SQL ones are faked per test (no database here).
vi.mock("../db/aiConnection.js", () => ({ aiDb: () => null }));
vi.mock("./askTools.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, runTool: vi.fn(real.runTool) };
});

const { handleUserMessage } = await import("./chat.js");
const { runTool } = await import("./askTools.js");
const { eventBus } = await import("../eventBus.js");

// A renderer that asked for streamed progress, recording what it was sent.
const streamEvent = () => {
  const sent = [];
  return {
    sent,
    event: {
      sender: {
        isDestroyed: () => false,
        send: (_channel, payload) => sent.push(payload),
      },
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  session.userId = 7;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Ask when the search index is unavailable", () => {
  it("returns the plain unavailable message instead of the generic model failure", async () => {
    semanticSearch.mockImplementation(() => {
      throw new IndexUnavailableError();
    });
    const { event, sent } = streamEvent();

    const result = await handleUserMessage(
      event,
      null,
      "What did I write about work?",
      "llama3.2",
      [],
      [],
      "s1",
    );

    expect(result).toMatchObject({
      code: "index-unavailable",
      chatId: 11,
      messageId: 21,
    });
    expect(result.error).toMatch(/Search isn't available/);
    expect(result.error).not.toMatch(/did not return a usable answer/);

    const errors = sent.filter((p) => p.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Search isn't available/);
    // The question is still saved; no AI reply is stored for it.
    expect(db.addMessage).toHaveBeenCalledWith(
      11,
      "user",
      "What did I write about work?",
      [],
      [],
    );
    expect(db.addAIMessage).not.toHaveBeenCalled();
    // Only the planning call ran; nothing was streamed.
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps the old behaviour for any other search failure", async () => {
    semanticSearch.mockImplementation(() => {
      throw new Error("connection reset");
    });
    const { event, sent } = streamEvent();

    const result = await handleUserMessage(
      event,
      5,
      "hello",
      "llama3.2",
      [],
      [],
      "s2",
    );

    expect(result.code).toBeUndefined();
    expect(result.error).toBe("The model did not return a usable answer.");
    expect(sent.filter((p) => p.type === "error")).toHaveLength(1);
  });
});

describe("Ask passes the model and prompt to the AI client (KAN-367)", () => {
  it("calls the planning step with the prompt, its schema and the model", async () => {
    semanticSearch.mockReturnValue([]);
    answer = JSON.stringify({ response: "ok", suggested_user_prompt: "next" });

    await handleUserMessage(null, 5, "What about the river?", "llama3.2");

    expect(ai.generate).toHaveBeenCalledTimes(2);
    const [prompt, options, ...extra] = ai.generate.mock.calls[0];
    expect(prompt).toContain("What about the river?");
    expect(options.ollamaModel).toBe("llama3.2");
    expect(options.schema.properties).toHaveProperty("intent");
    expect(extra).toEqual([]);
  });

  it("streams the answer with the model first and stores it with its source", async () => {
    semanticSearch.mockReturnValue([
      {
        id: 1,
        score: 0.9,
        payload: {
          source_type: "journal",
          source_id: 3,
          title: "By the river",
          content: "Walked by the river.",
        },
      },
    ]);
    answer = JSON.stringify({
      response: "You found calm by the river.",
      suggested_user_prompt: "When else did I feel calm?",
    });
    db.addMessage.mockResolvedValueOnce({ id: 21 });
    db.addMessage.mockResolvedValueOnce({ id: 22 });

    const result = await handleUserMessage(
      null,
      5,
      "What about the river?",
      "llama3.2",
    );

    const [prompt, options] = ai.generate.mock.calls[1];
    expect(prompt).toContain("What about the river?");
    expect(options.ollamaModel).toBe("llama3.2");
    expect(options.onToken).toBeTypeOf("function");
    expect(options.schema.properties).toHaveProperty("response");

    expect(result).toMatchObject({ chatId: 5, messageId: 21, aiMessageId: 22 });
    expect(db.addMessage).toHaveBeenLastCalledWith(
      5,
      "ai",
      'Looked at 1 entry about "What about the river?".\n\nYou found calm by the river.\n\nFollow-up: When else did I feel calm?',
      [
        {
          source_type: "journal",
          source_id: "3",
          source_title: "By the river",
        },
      ],
      [],
    );
  });
});

describe("Ask with a question too long for the embedding model (KAN-439)", () => {
  it("searches with a shorter start of the question", async () => {
    const sent = [];
    ai.embed.mockImplementation(async (text) => {
      sent.push(text.length);
      if (text.length > 3_000) {
        throw new Error(
          "Ollama embedding API error: 500 Internal Server Error",
        );
      }
      return [0.1, 0.2];
    });
    semanticSearch.mockReturnValue([]);
    answer = JSON.stringify({ response: "ok", suggested_user_prompt: "next" });

    const result = await handleUserMessage(
      null,
      5,
      "word ".repeat(10_000),
      "llama3.2",
    );

    expect(sent).toEqual([8_000, 4_000, 2_000]);
    expect(semanticSearch).toHaveBeenCalledWith([0.1, 0.2], 7, 50, {
      range: null,
    });
    expect(result.error).toBeUndefined();
  });
});

describe("Ask's answer cap (KAN-387)", () => {
  it("lets an answer over 1,200 characters finish as parseable JSON", async () => {
    semanticSearch.mockReturnValue([]);
    const long = "I noticed you wrote about the river often. ".repeat(40);
    expect(long.length).toBeGreaterThan(1200);
    answer = JSON.stringify({ response: long, suggested_user_prompt: "More?" });
    // A model cut at its cap, at about 4 characters a token.
    ai.generate.mockImplementation(async (_p, { onToken, maxTokens }) =>
      onToken
        ? answer.slice(0, maxTokens * 4)
        : JSON.stringify({ requires_context: false }),
    );

    const result = await handleUserMessage(null, 5, "The river?", "llama3.2");

    expect(result.error).toBeUndefined();
    expect(result.aiRes.chatResponse.response.endsWith(long)).toBe(true);
    expect(ai.generate).toHaveBeenCalledTimes(2); // no retry was needed
  });
});

describe("Ask stays with the profile that asked (KAN-454)", () => {
  it("refuses a chat id that is not this profile's", async () => {
    const result = await handleUserMessage(null, 99, "hi", "llama3.2");

    expect(result).toEqual({ error: "Chat not found" });
    expect(db.addMessage).not.toHaveBeenCalled();
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it("stops the answer and stores nothing when the profile switches", async () => {
    semanticSearch.mockReturnValue([]);
    let aborted = null;
    ai.generate.mockImplementation(async (_p, { onToken, signal }) => {
      if (!onToken) return JSON.stringify({ requires_context: false });
      onToken("x", '{"response":"Alice');
      session.userId = 8;
      eventBus.emit("session:changed");
      aborted = signal.aborted;
      onToken("y", '{"response":"Alice secret');
      throw new Error("aborted");
    });
    const { event, sent } = streamEvent();

    const result = await handleUserMessage(event, 5, "hi", "m", [], [], "s");

    expect(aborted).toBe(true);
    expect(result.code).toBe("profile-changed");
    // Only the question was saved; no answer for the old profile.
    expect(db.addMessage).toHaveBeenCalledTimes(1);
    const text = sent
      .filter((p) => p.type === "delta")
      .map((d) => d.text)
      .join("");
    expect(text).not.toContain("secret");
    expect(eventBus.listenerCount("session:changed")).toBe(0);
  });
});

describe("Ask remembers the conversation (KAN-444)", () => {
  it("sends earlier turns to both calls and searches a follow-up by its topic", async () => {
    db.recentMessages.mockReturnValueOnce([
      { sender: "user", content: "How was my sleep in August?" },
      {
        sender: "ai",
        content: "You slept badly early in August.\n\nFollow-up: Why?",
      },
    ]);
    semanticSearch.mockReturnValue([]);
    answer = JSON.stringify({ response: "ok", suggested_user_prompt: "next" });
    ai.embed.mockResolvedValue([0.1, 0.2]);
    ai.generate.mockImplementation(async (_p, { onToken } = {}) =>
      onToken
        ? answer
        : JSON.stringify({
            intent: "search",
            arguments: { query: "sleep" },
            unchecked: "",
          }),
    );

    await handleUserMessage(null, 5, "and in September?", "m");

    expect(db.recentMessages).toHaveBeenCalledWith(7, 5, 8);
    for (const [prompt] of ai.generate.mock.calls) {
      expect(prompt).toContain("Person: How was my sleep in August?");
      expect(prompt).toContain("MindSage: You slept badly early in August.");
      expect(prompt).not.toContain("Follow-up: Why?");
      expect(prompt).toContain("and in September?");
    }
    expect(ai.embed).toHaveBeenCalledWith("sleep");
  });

  it("a new chat has no history and searches with the question", async () => {
    semanticSearch.mockReturnValue([]);
    ai.generate.mockImplementation(async (_p, { onToken } = {}) =>
      onToken
        ? answer
        : JSON.stringify({ requires_context: true, base_query: "sleep" }),
    );

    await handleUserMessage(null, null, "How did I sleep?", "m");

    expect(db.recentMessages).not.toHaveBeenCalled();
    expect(ai.generate.mock.calls[0][0]).not.toContain("Earlier in this");
    expect(ai.embed).toHaveBeenCalledWith("How did I sleep?");
  });
});

describe("Ask picks one tool per question (KAN-447)", () => {
  const plan = (p) =>
    ai.generate.mockImplementation(async (_prompt, { onToken } = {}) =>
      onToken
        ? JSON.stringify({ response: "ok", suggested_user_prompt: "next" })
        : JSON.stringify(p),
    );
  const october = {
    ok: true,
    text: "<entry>October</entry>",
    sources: [{ source_type: "journal", source_id: "4", source_title: "Oct" }],
    summary: "Looked at 12 entries from 1 to 31 October.",
  };

  it("runs the plan's one tool with only its own arguments", async () => {
    plan({
      intent: "date_range",
      arguments: {
        from: "2025-10-01",
        to: "2025-10-31",
        query: "x",
        limit: null,
      },
      unchecked: "",
    });
    runTool.mockResolvedValueOnce(october);

    const result = await handleUserMessage(null, 5, "October?", "m");

    expect(runTool).toHaveBeenCalledTimes(1);
    expect(runTool).toHaveBeenCalledWith("get_entries_by_date", {
      from: "2025-10-01",
      to: "2025-10-31",
    });
    const [planPrompt] = ai.generate.mock.calls[0];
    const today = new Date();
    expect(planPrompt).toContain(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
    );
    expect(planPrompt).toContain(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(ai.generate.mock.calls[1][0]).toContain("<entry>October</entry>");
    expect(result.aiRes.chatResponse.response).toBe(
      "Looked at 12 entries from 1 to 31 October.\n\nok",
    );
    expect(db.addMessage.mock.calls.at(-1)[3]).toEqual(october.sources);
  });

  it("falls back to searching the question when the tool refuses the arguments", async () => {
    plan({ intent: "mood_stats", arguments: { from: "May" }, unchecked: "" });
    semanticSearch.mockReturnValue([]);

    await handleUserMessage(null, 5, "How was my mood?", "m");

    expect(runTool.mock.calls.map((c) => c[0])).toEqual([
      "mood_stats",
      "search_entries",
    ]);
    expect(runTool.mock.calls[1][1]).toEqual({ query: "How was my mood?" });
  });

  it("answers a count question by searching until KAN-143", async () => {
    plan({ intent: "count", arguments: { query: "runs" }, unchecked: "" });
    semanticSearch.mockReturnValue([]);

    await handleUserMessage(null, 5, "How often did I run?", "m");

    expect(runTool).toHaveBeenCalledWith("search_entries", { query: "runs" });
  });

  it("intent none answers without the journal", async () => {
    plan({ intent: "none", arguments: {}, unchecked: "" });

    const result = await handleUserMessage(null, 5, "Hello!", "m");

    expect(runTool).not.toHaveBeenCalled();
    expect(ai.generate.mock.calls[1][0]).not.toContain("From the journal");
    expect(result.aiRes.chatResponse.response).toBe("ok");
  });

  it("tells the answer what the one tool did not check", async () => {
    plan({
      intent: "mood_stats",
      arguments: { from: "2025-10-01", to: "2025-10-31", group_by: "week" },
      unchecked: "your running goal",
    });
    runTool.mockResolvedValueOnce(october);

    await handleUserMessage(null, 5, "Compare my mood and running", "m");

    expect(ai.generate.mock.calls[1][0]).toContain(
      "you did not check: your running goal",
    );
  });

  it("searches the question when the planning call times out", async () => {
    ai.generate.mockImplementation(async (_prompt, { onToken } = {}) => {
      if (onToken)
        return JSON.stringify({ response: "ok", suggested_user_prompt: "n" });
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    semanticSearch.mockReturnValue([]);

    const result = await handleUserMessage(null, 5, "Work stress?", "m");

    expect(runTool).toHaveBeenCalledWith("search_entries", {
      query: "Work stress?",
    });
    expect(result.error).toBeUndefined();
  });
});
