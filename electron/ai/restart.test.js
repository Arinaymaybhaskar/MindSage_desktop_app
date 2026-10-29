import { describe, expect, it, vi } from "vitest";
import * as queue from "./queue.js";
import { createRestarter } from "./restart.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => (resolve = res));
  return { promise, resolve };
};

const make = (over = {}) => {
  const seen = [];
  const deps = {
    provider: () => "builtin",
    reloadBuiltin: async () => {},
    ollamaRunning: async () => true,
    queue,
    pauseDownload: async () => null,
    resumeDownload: vi.fn(),
    onChange: (s) => seen.push(s.state),
    log: { error: vi.fn() },
    ...over,
  };
  return { seen, deps, restarter: createRestarter(deps) };
};

describe("restart local AI", () => {
  it("goes starting then ready, and a queued job survives and completes", async () => {
    const reload = deferred();
    const { restarter, seen } = make({ reloadBuiltin: () => reload.promise });
    const done = restarter.restart();
    await Promise.resolve();
    let ran = false;
    const job = queue.background(async () => (ran = true));
    await new Promise((r) => setTimeout(r, 5));
    expect(ran).toBe(false); // held while restarting
    reload.resolve();
    expect((await done).state).toBe("ready");
    await job;
    expect(ran).toBe(true);
    expect(seen).toEqual(["starting", "ready"]);
  });

  it("debounces: a press during a restart is a no-op returning the status", async () => {
    const reload = deferred();
    const reloadBuiltin = vi.fn(() => reload.promise);
    const { restarter } = make({ reloadBuiltin });
    const first = restarter.restart();
    await Promise.resolve();
    expect((await restarter.restart()).state).toBe("starting");
    reload.resolve();
    await first;
    expect(reloadBuiltin).toHaveBeenCalledTimes(1);
    await restarter.restart();
    expect(reloadBuiltin).toHaveBeenCalledTimes(2);
  });

  it("reports an error with details and still resumes the queue", async () => {
    const { restarter } = make({
      reloadBuiltin: async () => {
        throw new Error("engine would not start");
      },
    });
    const status = await restarter.restart();
    expect(status).toMatchObject({
      state: "error",
      details: "engine would not start",
    });
    await expect(queue.background(async () => "ok")).resolves.toBe("ok");
  });

  it("pauses a running download and resumes it afterwards", async () => {
    const order = [];
    const { restarter, deps } = make({
      pauseDownload: async () => (order.push("pause"), "m1"),
      reloadBuiltin: async () => order.push("reload"),
      resumeDownload: (id) => order.push(`resume ${id}`),
    });
    await restarter.restart();
    expect(order).toEqual(["pause", "reload", "resume m1"]);
    expect(deps.log.error).not.toHaveBeenCalled();
  });

  it("does not fake an Ollama restart", async () => {
    const reloadBuiltin = vi.fn();
    const { restarter } = make({
      provider: () => "ollama",
      reloadBuiltin,
      ollamaRunning: async () => false,
    });
    const status = await restarter.restart();
    expect(reloadBuiltin).not.toHaveBeenCalled();
    expect(status).toMatchObject({ managed: false, state: "error" });
  });
});
