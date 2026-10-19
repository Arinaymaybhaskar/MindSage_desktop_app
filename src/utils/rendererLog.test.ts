import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installRendererLogging,
  reportToMain,
  toLoggable,
} from "./rendererLog";

const send = vi.fn();
let undo: (() => void) | undefined;

beforeEach(() => {
  send.mockClear();
  (window as unknown as { electron: unknown }).electron = { send };
});
afterEach(() => {
  undo?.();
  undo = undefined;
  delete (window as unknown as { electron?: unknown }).electron;
});

describe("rendererLog", () => {
  it("sends console.error and console.warn through the one channel", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    undo = installRendererLogging();
    console.error("boom", { id: 3 });
    console.warn("careful");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith("log:renderer", {
      level: "error",
      args: ["boom", { id: 3 }],
    });
    expect(send.mock.calls[1][1].level).toBe("warn");
    quiet.mockRestore();
  });

  it("does not send console.log or console.info", () => {
    const quiet = vi.spyOn(console, "log").mockImplementation(() => {});
    undo = installRendererLogging();
    console.log("hello");
    console.info("hello");
    expect(send).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("reports uncaught errors and unhandled rejections", () => {
    undo = installRendererLogging();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("kaput") }),
    );
    const rejection = new Event("unhandledrejection") as Event & {
      reason?: unknown;
    };
    rejection.reason = new Error("nope");
    window.dispatchEvent(rejection);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1].args[0]).toBe("Uncaught error");
    expect(send.mock.calls[1][1].args[0]).toBe("Unhandled promise rejection");
  });

  it("installs only once and can be undone", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    undo = installRendererLogging();
    const second = installRendererLogging();
    second();
    console.error("x");
    expect(send).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("never throws into the page when the bridge is missing or breaks", () => {
    delete (window as unknown as { electron?: unknown }).electron;
    expect(() => reportToMain("error", ["x"])).not.toThrow();
    (window as unknown as { electron: unknown }).electron = {
      send: () => {
        throw new Error("closed");
      },
    };
    expect(() => reportToMain("error", ["x"])).not.toThrow();
  });

  it("turns errors, long strings and big objects into small JSON-safe values", () => {
    const out = toLoggable(new Error("bad")) as {
      error: string;
      stack: string;
    };
    expect(out.error).toBe("Error");
    expect(out.stack.split("\n").length).toBeLessThanOrEqual(8);
    expect((toLoggable("x".repeat(2000)) as string).length).toBe(500);
    expect(toLoggable(() => 1)).toBe("[function]");
    expect(() =>
      JSON.stringify(toLoggable({ a: { b: { c: { d: 1 } } } })),
    ).not.toThrow();
  });
});
