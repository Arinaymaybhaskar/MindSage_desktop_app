import { describe, expect, it } from "vitest";
import { background, foreground, yieldToAsk } from "./queue.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("shared AI queue", () => {
  it("runs background jobs one at a time, in order, past a failure", async () => {
    const order = [];
    const first = deferred();
    const a = background(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
    });
    const b = background(async () => {
      order.push("b");
      throw new Error("bad");
    });
    const c = background(async () => order.push("c"));
    await tick();
    expect(order).toEqual(["a start"]);
    first.resolve();
    await a;
    await expect(b).rejects.toThrow("bad");
    await c;
    expect(order).toEqual(["a start", "a end", "b", "c"]);
  });

  it("holds background jobs while an Ask runs, and lets Ask past them", async () => {
    const order = [];
    const ask = deferred();
    const asking = foreground(async () => {
      order.push("ask");
      await ask.promise;
      order.push("ask done");
    });
    const job = background(async () => order.push("job"));
    await tick();
    // A second Ask does not wait for the queued job.
    await foreground(async () => order.push("ask 2"));
    expect(order).toEqual(["ask", "ask 2"]);
    ask.resolve();
    await asking;
    await job;
    expect(order).toEqual(["ask", "ask 2", "ask done", "job"]);
  });

  it("aborts a running background call when an Ask starts, then runs it again (KAN-390)", async () => {
    const signals = [];
    // A model call that runs until its signal is aborted, the second time it finishes.
    const call = (signal) => {
      signals.push(signal);
      if (signals.length > 1) return Promise.resolve("done");
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    };
    const job = background(() => yieldToAsk(call));
    await tick();
    expect(signals).toHaveLength(1);

    const ask = deferred();
    const asking = foreground(() => ask.promise);
    expect(signals[0].aborted).toBe(true);
    await tick();
    expect(signals).toHaveLength(1); // not again while Ask runs
    ask.resolve();
    await asking;
    expect(await job).toBe("done");
    expect(signals).toHaveLength(2);
  });

  it("passes on a failure that was not Ask's abort", async () => {
    await expect(
      yieldToAsk(async () => {
        throw new Error("model missing");
      }),
    ).rejects.toThrow("model missing");
  });
});
