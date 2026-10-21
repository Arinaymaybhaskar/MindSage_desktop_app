import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import http from "node:http";

// A fake OpenAI-compatible server (LM Studio's shape) on a loopback port. The
// real client and the real enrichment validators (AIPrompts.js) run against it.
const settings = {};
vi.mock("../store.js", () => ({
  modelStore: { get: (key) => settings[key], set: vi.fn(), delete: vi.fn() },
}));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { generate, embed, activeProvider } = await import("./client.js");
const { openaiBase, EMBED_DIMENSIONS } = await import("./openai.js");
const { validateProvider } = await import("./providers.js");
const { JOURNAL_METADATA_SCHEMA, parseJournalMetadata, sanitizeSummary } =
  await import("../methods/AIPrompts.js");

const METADATA = '{"title":"A walk","mood_score":4,"mood_tags":["Content"]}';
const SUMMARY = "The writer walked home in the rain and felt calm.";
let server;
let port;
let lastBody;
let reply;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/v1/models") {
        return res.end(JSON.stringify({ data: [{ id: "local-model" }] }));
      }
      lastBody = raw ? JSON.parse(raw) : null;
      if (req.url === "/v1/embeddings") {
        const size = reply.dimensions ?? EMBED_DIMENSIONS;
        return res.end(
          JSON.stringify({ data: [{ embedding: new Array(size).fill(0.1) }] }),
        );
      }
      if (lastBody.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        for (const part of reply.content.match(/.{1,8}/g)) {
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`,
          );
        }
        return res.end("data: [DONE]\n\n");
      }
      res.end(
        JSON.stringify({ choices: [{ message: { content: reply.content } }] }),
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  settings.aiProvider = "openai";
  settings.openaiCompat = {
    url: "http://localhost",
    port,
    model: "local-model",
  };
  reply = { content: SUMMARY };
  lastBody = null;
});

describe("the OpenAI-compatible provider", () => {
  it("passes the enrichment metadata through the same validators", async () => {
    reply.content = METADATA;
    const out = await generate("entry", {
      schema: JOURNAL_METADATA_SCHEMA,
      maxTokens: 100,
    });
    expect(lastBody.response_format.json_schema.schema).toEqual(
      JOURNAL_METADATA_SCHEMA,
    );
    expect(parseJournalMetadata(out)).toMatchObject({ title: "A walk" });
  });

  it("rejects bad structured output the same way as every provider", async () => {
    reply.content = '{"title":""}';
    const out = await generate("entry", { schema: JOURNAL_METADATA_SCHEMA });
    expect(parseJournalMetadata(out)).toBeNull();
  });

  it("answers a summary, streamed or not", async () => {
    const seen = [];
    const streamed = await generate("entry", {
      system: "Summarise.",
      onToken: (_f, full) => seen.push(full),
    });
    expect(streamed).toBe(SUMMARY);
    expect(seen.at(-1)).toBe(SUMMARY);
    expect(lastBody.messages[0]).toEqual({
      role: "system",
      content: "Summarise.",
    });
    expect(sanitizeSummary(await generate("entry"))).toBeTruthy();
  });

  it("embeds with the search model's size", async () => {
    expect(await embed("hello")).toHaveLength(EMBED_DIMENSIONS);
  });

  it("is never the default", () => {
    delete settings.aiProvider;
    expect(activeProvider()).not.toBe("openai");
  });
});

describe("validating an OpenAI-compatible server", () => {
  const check = (extra = {}) =>
    validateProvider("openai", { url: "localhost", port, ...extra });

  it("accepts a working server", async () => {
    expect(await check({ model: "local-model" })).toEqual({ ok: true });
  });

  it("says which port nothing answers on (non-default port)", async () => {
    const res = await check({ port: 1 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("port 1");
  });

  it("refuses a model the server does not have", async () => {
    expect((await check({ model: "nope" })).ok).toBe(false);
  });

  it("refuses an embedding model of the wrong size", async () => {
    reply.dimensions = 384;
    expect((await check()).error).toContain("768");
  });

  it("refuses a server that is not OpenAI-compatible", async () => {
    const fetchImpl = async () => new Response("<html></html>");
    const res = await validateProvider(
      "openai",
      { url: "localhost", port },
      fetchImpl,
    );
    expect(res.ok).toBe(false);
  });
});

describe("the loopback restriction", () => {
  it.each(["localhost", "127.0.0.1", "http://[::1]", "http://127.0.0.2:8000"])(
    "allows %s",
    (url) => expect(openaiBase({ url, port: 1234 }).ok).toBe(true),
  );

  it.each([
    "http://example.com",
    "http://192.168.1.5",
    "http://10.0.0.2",
    "http://localhost.evil.com",
    "http://127.0.0.1.evil.com",
    "http://user:pw@localhost",
    "ftp://localhost",
    "http://0.0.0.0",
  ])("refuses %s", (url) => expect(openaiBase({ url }).ok).toBe(false));

  it("checks the port", () => {
    expect(openaiBase({ url: "localhost", port: 70000 }).ok).toBe(false);
    expect(openaiBase({ url: "localhost" })).toEqual({
      ok: true,
      base: "http://127.0.0.1:1234",
    });
  });

  it("does not call a remote host even if one was saved", async () => {
    settings.openaiCompat = { url: "http://example.com", port: 80 };
    await expect(generate("hi")).rejects.toThrow(/on this PC/);
  });
});
