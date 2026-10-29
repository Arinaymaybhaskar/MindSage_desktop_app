import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The real ollama.js, so a call that puts the model or prompt in the wrong
// argument is seen as it would be at run time. Only the network edge (fetch)
// and the modules that need Electron or the native database are replaced.
vi.mock("../db/connection.js", () => ({ db: { prepare: vi.fn() } }));
// Ollama is the provider here; the built-in engine has its own tests.
vi.mock("../store.js", () => ({
  modelStore: { get: (key) => (key === "aiProvider" ? "ollama" : undefined) },
}));
vi.mock("../session.js", () => ({ currentUserId: () => 7 }));
const db = {
  AddChat: vi.fn(async () => ({ id: 11 })),
  addMessage: vi.fn(),
  isOwnChat: () => true,
};
vi.mock("../db/index.js", () => ({ default: db }));
const semanticSearch = vi.fn();
vi.mock("./search.js", () => ({ semanticSearch }));

const { handleUserMessage } = await import("./chat.js");

const MODEL = "llama3.2:latest";
const QUESTION = "What did I write about the river?";

/** A fake Ollama: records each request body and answers like the real one. */
function fakeOllama() {
  const requests = [];
  const fetchMock = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    if (url.endsWith("/api/embeddings")) {
      return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }));
    }
    if (body.stream) {
      const answer = JSON.stringify({
        response: "The river came up twice.",
        suggested_user_prompt: "What else calms me?",
      });
      const ndjson =
        JSON.stringify({ response: answer.slice(0, 10) }) +
        "\n" +
        JSON.stringify({ response: answer.slice(10) }) +
        "\n" +
        JSON.stringify({ done: true }) +
        "\n";
      return new Response(ndjson);
    }
    return new Response(
      JSON.stringify({
        response: JSON.stringify({ requires_context: true }),
      }),
    );
  });
  return { requests, fetchMock };
}

let fake;
beforeEach(() => {
  vi.clearAllMocks();
  fake = fakeOllama();
  vi.stubGlobal("fetch", fake.fetchMock);
  db.addMessage.mockResolvedValueOnce({ id: 21 }).mockResolvedValueOnce({
    id: 22,
  });
  semanticSearch.mockReturnValue([
    {
      id: 1,
      score: 0.9,
      payload: { source_type: "journal", source_id: 3, title: "River" },
    },
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe("Ask through the real Ollama client (KAN-367)", () => {
  it("sends the selected model and the question to /api/generate and stores the answer", async () => {
    const result = await handleUserMessage(null, null, QUESTION, MODEL);

    const generate = fake.requests.filter((r) =>
      r.url.endsWith("/api/generate"),
    );
    expect(generate).toHaveLength(2);
    for (const { body } of generate) {
      expect(body.model).toBe(MODEL);
      expect(body.prompt).toContain(QUESTION);
      expect(body.format).toMatchObject({ type: "object" });
    }
    expect(generate[0].body.stream).toBe(false);
    expect(generate[1].body.stream).toBe(true);

    expect(result).toMatchObject({
      chatId: 11,
      messageId: 21,
      aiMessageId: 22,
    });
    expect(db.addMessage).toHaveBeenLastCalledWith(
      11,
      "ai",
      "The river came up twice.\n\nFollow-up: What else calms me?",
      [{ source_type: "journal", source_id: "3", source_title: "River" }],
      [],
    );
  });
});
