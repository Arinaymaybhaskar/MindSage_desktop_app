import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listOllamaModels,
  humanBytes,
  LIST_TIMEOUT_MS,
  SHOW_TIMEOUT_MS,
  NOT_RESPONDING,
  NOT_RUNNING,
} from "./ollamaList.js";

// A fetch that never answers, like an Ollama that accepted the connection and
// hung. It rejects only when its signal aborts, as the real fetch does.
const hungFetch = vi.fn(
  (_url, { signal } = {}) =>
    new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason));
    }),
);

const json = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
});

const TAGS = {
  models: [
    {
      name: "llama3.2:3b",
      model: "llama3.2:3b",
      modified_at: "2026-10-01T10:00:00Z",
      size: 2019393189,
      digest:
        "a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72",
      details: { family: "llama" },
    },
  ],
};

const SHOW = {
  modified_at: "2026-10-01T10:00:00Z",
  capabilities: ["completion", "tools"],
  details: { family: "llama", parameter_size: "3.2B" },
  model_info: { "tokenizer.ggml.tokens": ["a", "b"], "general.name": "x" },
  tensors: [{}],
  modelfile: "FROM x",
  license: "...",
};

afterEach(() => {
  vi.useRealTimers();
  hungFetch.mockClear();
});

describe("listOllamaModels", () => {
  it("returns the not-responding error at the timeout when Ollama hangs", async () => {
    vi.useFakeTimers();
    let settled = null;
    const pending = listOllamaModels({ fetchImpl: hungFetch }).then((r) => {
      settled = r;
    });

    await vi.advanceTimersByTimeAsync(LIST_TIMEOUT_MS - 1);
    expect(settled).toBeNull(); // still waiting, and nothing blocked

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toEqual({ error: NOT_RESPONDING, reason: "timeout" });
    expect(hungFetch).toHaveBeenCalledTimes(1);
    expect(hungFetch.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/tags");
  });

  it("holds the deadline even if a fetch ignores its abort signal", async () => {
    vi.useFakeTimers();
    const deaf = vi.fn(() => new Promise(() => {}));
    const pending = listOllamaModels({ fetchImpl: deaf, timeoutMs: 3000 });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toEqual({
      error: NOT_RESPONDING,
      reason: "timeout",
    });
  });

  it("returns the not-running error when nothing is listening", async () => {
    const refused = vi.fn(async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      });
    });
    await expect(listOllamaModels({ fetchImpl: refused })).resolves.toEqual({
      error: NOT_RUNNING,
      reason: "unreachable",
    });
  });

  it("returns bad-response for an HTTP error or an unexpected body", async () => {
    const fail = vi.fn(async () => json({}, false));
    await expect(listOllamaModels({ fetchImpl: fail })).resolves.toMatchObject({
      reason: "bad-response",
    });
    const odd = vi.fn(async () => json({ nope: true }));
    await expect(listOllamaModels({ fetchImpl: odd })).resolves.toMatchObject({
      reason: "bad-response",
    });
  });

  it("maps a good reply to the rows the Models screen reads", async () => {
    const fetchImpl = vi.fn(async (url) =>
      url.endsWith("/api/tags") ? json(TAGS) : json(structuredClone(SHOW)),
    );
    const rows = await listOllamaModels({ fetchImpl });

    // `size` and `modified` keep the old `ollama list` column mix-up: the
    // short ID and the human size (ModelSettings reads the size from
    // `modified` and the date from the show info).
    expect(rows).toEqual([
      {
        name: "llama3.2:3b",
        size: "a80c4f17acd5",
        modified: "2.0 GB",
        info: {
          modified_at: "2026-10-01T10:00:00Z",
          capabilities: ["completion", "tools"],
          details: { family: "llama", parameter_size: "3.2B" },
          model_info: { "general.name": "x" },
        },
      },
    ]);
    const showCall = fetchImpl.mock.calls[1];
    expect(showCall[0]).toBe("http://127.0.0.1:11434/api/show");
    expect(JSON.parse(showCall[1].body)).toEqual({
      model: "llama3.2:3b",
      verbose: true,
    });
  });

  it("keeps the basic row when /api/show hangs, within its own timeout", async () => {
    vi.useFakeTimers();
    const onShowError = vi.fn();
    const fetchImpl = vi.fn((url, init) =>
      url.endsWith("/api/tags")
        ? Promise.resolve(json(TAGS))
        : hungFetch(url, init),
    );
    const pending = listOllamaModels({ fetchImpl, onShowError });
    await vi.advanceTimersByTimeAsync(SHOW_TIMEOUT_MS);
    await expect(pending).resolves.toEqual([
      { name: "llama3.2:3b", size: "a80c4f17acd5", modified: "2.0 GB" },
    ]);
    expect(onShowError).toHaveBeenCalledWith("llama3.2:3b", expect.any(Error));
  });

  it("returns an empty list when no models are installed", async () => {
    const fetchImpl = vi.fn(async () => json({ models: [] }));
    await expect(listOllamaModels({ fetchImpl })).resolves.toEqual([]);
  });
});

describe("humanBytes", () => {
  it("prints sizes the way ollama list does", () => {
    expect(humanBytes(2019393189)).toBe("2.0 GB");
    expect(humanBytes(4661224676)).toBe("4.7 GB");
    expect(humanBytes(274302450)).toBe("274 MB");
    expect(humanBytes(13_000_000_000)).toBe("13 GB");
    expect(humanBytes(3_000_000_000)).toBe("3 GB");
    expect(humanBytes(512)).toBe("512 B");
    expect(humanBytes(undefined)).toBe("");
  });
});
