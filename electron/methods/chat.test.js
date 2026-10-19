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

const ollama = {
  generateEmbedding: vi.fn(async () => [0.1, 0.2]),
  // The first model call decides whether the question needs the journal.
  handleOllamaPrompt: vi.fn(async () =>
    JSON.stringify({ requires_context: true }),
  ),
  streamOllamaPrompt: vi.fn(),
};
vi.mock("./ollama.js", () => ollama);

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
    expect(ollama.streamOllamaPrompt).not.toHaveBeenCalled();
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
