import { describe, it, expect, vi, beforeEach } from "vitest";
import { IndexUnavailableError } from "../services/searchIndex.js";

// chat.js reaches the database, Ollama and Qdrant; all three are replaced so
// handleUserMessage can run to the point where Ask searches the journal.
const db = {
  AddChat: vi.fn(async () => ({ id: 11 })),
  addMessage: vi.fn(async () => ({ id: 21 })),
  addAIMessage: vi.fn(),
};
vi.mock("../db/index.js", () => ({ default: db }));

// The first model call decides whether the question needs the journal; the
// streamed one (with onToken) answers with whatever a test put in `answer`.
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
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));

const { handleUserMessage } = await import("./chat.js");

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
    expect(options.schema.properties).toHaveProperty("requires_context");
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
      "You found calm by the river.\n\nFollow-up: When else did I feel calm?",
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
