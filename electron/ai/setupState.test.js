import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKOFF_MS,
  OLLAMA_REGISTRY,
  checkReachable,
  createSetup,
} from "./setupState.js";

const GiB = 2 ** 30;

function make({ answered, ...over } = {}) {
  const have = new Set();
  const states = [];
  let asked = answered ? false : undefined;
  const deps = {
    provider: () => "builtin",
    plan: () => ["nomic-embed-text-v1.5"].filter((id) => !have.has(id)),
    chatId: () => "qwen-2.5-1.5b",
    totalMem: () => 16 * GiB,
    freeDisk: () => 100 * GiB,
    partBytes: () => 0,
    download: vi.fn(async (id) => {
      have.add(id);
      return { success: true };
    }),
    pauseDownload: vi.fn(async () => null),
    reachable: vi.fn(async () => "ok"),
    hostFor: () => "https://huggingface.co",
    probeFor: (id) => `https://huggingface.co/${id}.gguf`,
    pullOllama: vi.fn(),
    asked: { get: () => asked, set: (v) => (asked = v) },
    onReady: vi.fn(),
    onChange: (s) => states.push(s.state),
    ...over,
  };
  return { deps, states, setup: createSetup(deps), have };
}

afterEach(() => vi.useRealTimers());

describe("setup state transitions", () => {
  it("asks the metered question once, then downloads to ready", async () => {
    const { setup, states, deps } = make();
    expect((await setup.start()).state).toBe("metered");
    await setup.answerMetered(false);
    expect(states).toContain("downloading");
    expect(setup.getState().state).toBe("ready");
    expect(deps.onReady).toHaveBeenCalledOnce();
    // Asked once: a later start goes straight through (nothing left to fetch).
    expect((await setup.start()).state).toBe("ready");
  });

  it("waiting for Wi-Fi pauses without downloading", async () => {
    const { setup, deps } = make();
    await setup.start();
    expect(setup.answerMetered(true).state).toBe("paused");
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("reports low memory until confirmed", async () => {
    const { setup } = make({
      chatId: () => "llama-3.1-8b",
      totalMem: () => 6 * GiB,
    });
    expect((await setup.start()).state).toBe("low-memory");
    // KAN-496: confirming low memory does not answer the metered question.
    expect((await setup.start({ lowMemoryOk: true })).state).toBe("metered");
    await setup.answerMetered(false);
    expect(setup.getState().state).toBe("ready");
  });

  it("remembers a confirmed low-memory warning across a relaunch (KAN-503)", async () => {
    let saved;
    const over = {
      chatId: () => "llama-3.1-8b",
      totalMem: () => 6 * GiB,
      lowMemoryOk: { get: () => saved, set: (v) => (saved = v) },
      answered: true,
    };
    await make(over).setup.start({ lowMemoryOk: true });
    expect(saved).toBe(true);
    const relaunched = make(over);
    expect((await relaunched.setup.start()).state).not.toBe("low-memory");
  });

  // KAN-500: the launch resume and the offline retry call start() with no flags.
  it("an unanswered metered question stays a question on a later start", async () => {
    const { setup, deps } = make();
    await setup.start();
    expect((await setup.start()).state).toBe("metered");
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("Wait for Wi-Fi stays paused across later starts and offline retries", async () => {
    vi.useFakeTimers();
    const { setup, deps } = make();
    await setup.start();
    setup.answerMetered(true);
    expect((await setup.start()).state).toBe("paused");
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("reports low disk with the shortfall", async () => {
    const { setup } = make({ freeDisk: () => 1000 });
    const s = await setup.start();
    expect(s).toMatchObject({ state: "low-disk", freeBytes: 1000 });
    expect(s.needBytes).toBeGreaterThan(1000);
  });

  it("reports a proxy that wants sign-in as work-network", async () => {
    const { setup, deps } = make({ reachable: async () => "work-network" });
    expect((await setup.start()).state).toBe("work-network");
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("pause stops the download and shows paused", async () => {
    const { setup, deps } = make();
    expect((await setup.pause()).state).toBe("paused");
    expect(deps.pauseDownload).toHaveBeenCalled();
  });

  it("a paused download result becomes paused, not failed", async () => {
    const { setup } = make({ download: async () => ({ paused: true }) });
    await setup.start();
    await setup.answerMetered(false);
    expect(setup.getState()).toMatchObject({ state: "paused", reason: "user" });
  });

  it("a non-network error is failed with its message", async () => {
    const { setup } = make({ download: async () => ({ error: "HTTP 404" }) });
    await setup.start();
    await setup.answerMetered(false);
    expect(setup.getState()).toMatchObject({
      state: "failed",
      error: "HTTP 404",
    });
  });
});

describe("offline first run", () => {
  it("is offline, retries with backoff, then downloads when online", async () => {
    vi.useFakeTimers();
    let net = "offline";
    const { setup, states, deps } = make({
      answered: true,
      reachable: async () => net,
    });
    await setup.start();
    expect(setup.getState()).toMatchObject({
      state: "offline",
      retryInMs: BACKOFF_MS[0],
    });
    // Still offline at the first retry: backs off further.
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(setup.getState()).toMatchObject({ retryInMs: BACKOFF_MS[1] });
    net = "ok";
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[1]);
    expect(deps.download).toHaveBeenCalledOnce();
    expect(setup.getState().state).toBe("ready");
    expect(states.at(-1)).toBe("ready");
  });

  it("the online event retries at once", async () => {
    vi.useFakeTimers();
    let net = "offline";
    const { setup, deps } = make({
      answered: true,
      reachable: async () => net,
    });
    await setup.start();
    net = "ok";
    await setup.online();
    expect(deps.download).toHaveBeenCalledOnce();
    expect(setup.getState().state).toBe("ready");
  });

  it("a drop mid-download goes offline and resumes later", async () => {
    vi.useFakeTimers();
    let net = "ok";
    let calls = 0;
    const { setup, have } = make({
      answered: true,
      reachable: async () => net,
      download: async (id) => {
        if (calls++ === 0) {
          net = "offline";
          return { error: "terminated" };
        }
        have.add(id);
        return { success: true };
      },
    });
    await setup.start();
    expect(setup.getState().state).toBe("offline");
    net = "ok";
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(setup.getState().state).toBe("ready");
  });

  it("checks Ollama's registry, then hands over to Ollama's own pull", async () => {
    const reachable = vi.fn(async () => "ok");
    const { setup, deps } = make({ provider: () => "ollama", reachable });
    await setup.start();
    expect(reachable).toHaveBeenCalledWith(OLLAMA_REGISTRY);
    expect(deps.pullOllama).toHaveBeenCalledOnce();
  });
});

describe("checksum mismatch", () => {
  const bad = { error: "Download failed: checksum mismatch" };

  it("retries once, then succeeds", async () => {
    const results = [bad];
    const { setup, deps, have } = make({
      answered: true,
      download: vi.fn(async (id) => {
        const r = results.shift();
        if (r) return r;
        have.add(id);
        return { success: true };
      }),
    });
    await setup.start();
    expect(deps.download).toHaveBeenCalledTimes(2);
    expect(setup.getState().state).toBe("ready");
  });

  it("fails clearly after the second mismatch, with no third try", async () => {
    const { setup, deps } = make({
      answered: true,
      download: vi.fn(async () => bad),
    });
    await setup.start();
    expect(deps.download).toHaveBeenCalledTimes(2);
    expect(setup.getState()).toMatchObject({ state: "failed" });
    expect(setup.getState().error).toMatch(/damaged twice/);
  });
});

describe("checkReachable", () => {
  const res = (status, type = "application/json") => ({
    status,
    headers: { get: () => type },
  });

  it("probes the model file, not the host's home page", async () => {
    const { setup, deps } = make();
    await setup.start();
    expect(deps.reachable).toHaveBeenCalledWith(
      "https://huggingface.co/nomic-embed-text-v1.5.gguf",
    );
  });

  it("treats 407 as work-network", async () => {
    expect(await checkReachable("https://x", async () => res(407))).toBe(
      "work-network",
    );
  });

  it("treats a captive portal's HTML as offline", async () => {
    expect(
      await checkReachable("https://x", async () => res(200, "text/html")),
    ).toBe("offline");
  });

  it("treats a network error as offline and a redirect as reachable", async () => {
    const fail = async () => {
      throw new Error("fetch failed");
    };
    expect(await checkReachable("https://x", fail)).toBe("offline");
    expect(await checkReachable("https://x", async () => res(302))).toBe("ok");
  });

  it("gives up after 5 seconds", async () => {
    let signal;
    const hang = (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init.signal;
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    const p = checkReachable("https://x", hang);
    expect(await p).toBe("offline");
  }, 8000);
});
