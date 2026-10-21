import { describe, expect, it } from "vitest";
import { background, foreground } from "./queue.js";

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
});
