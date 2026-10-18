import { describe, it, expect, vi } from "vitest";
import { createUpdateRelay, UPDATE_ERROR_MESSAGE } from "./updateRelay.js";

const setup = () => {
  const send = vi.fn();
  return { send, relay: createUpdateRelay(send) };
};

describe("updateRelay", () => {
  it("starts idle and cannot install", () => {
    const { relay } = setup();
    expect(relay.getState()).toEqual({ phase: "idle" });
    expect(relay.canInstall()).toBe(false);
  });

  it("relays available, progress and downloaded on the channels the window listens to", () => {
    const { relay, send } = setup();
    relay.available({ version: "1.4.0" });
    relay.progress({ percent: 41.6 });
    relay.downloaded({ version: "1.4.0" });
    expect(send.mock.calls).toEqual([
      ["update:available", { version: "1.4.0" }],
      ["update:progress", { percent: 42 }],
      ["update:downloaded", { version: "1.4.0" }],
    ]);
    expect(relay.getState()).toEqual({ phase: "ready", version: "1.4.0" });
    expect(relay.canInstall()).toBe(true);
  });

  it("clamps a nonsense percentage", () => {
    const { relay } = setup();
    relay.progress({ percent: 180 });
    expect(relay.getState()).toMatchObject({ percent: 100 });
    relay.progress({});
    expect(relay.getState()).toMatchObject({ percent: 0 });
  });

  it("only allows install once the download finished", () => {
    const { relay } = setup();
    relay.available({ version: "1.4.0" });
    expect(relay.canInstall()).toBe(false);
    relay.progress({ percent: 99 });
    expect(relay.canInstall()).toBe(false);
    relay.downloaded({ version: "1.4.0" });
    expect(relay.canInstall()).toBe(true);
  });

  it("reports a failed download with a retry-later message", () => {
    const { relay, send } = setup();
    relay.available({ version: "1.4.0" });
    relay.failed();
    expect(send).toHaveBeenLastCalledWith("update:error", {
      message: UPDATE_ERROR_MESSAGE,
    });
    expect(relay.getState()).toMatchObject({
      phase: "error",
      version: "1.4.0",
    });
    expect(relay.canInstall()).toBe(false);
  });

  it("a later failed check or newer event never takes away a ready update", () => {
    const { relay, send } = setup();
    relay.downloaded({ version: "1.4.0" });
    send.mockClear();
    relay.failed();
    relay.available({ version: "1.5.0" });
    relay.progress({ percent: 10 });
    expect(send).not.toHaveBeenCalled();
    expect(relay.getState()).toEqual({ phase: "ready", version: "1.4.0" });
    expect(relay.canInstall()).toBe(true);
  });
});
