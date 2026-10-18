import { describe, it, expect, vi } from "vitest";
import { createServiceAnnouncer } from "./serviceAnnouncer.js";

const fakeWindow = () => ({
  destroyed: false,
  isDestroyed() {
    return this.destroyed;
  },
  webContents: { send: vi.fn() },
});

const READY = { degraded: false, search: true };
const DEGRADED = { degraded: true, search: false };

describe("createServiceAnnouncer", () => {
  it("sends the status at once when the window already exists", () => {
    const win = fakeWindow();
    const onSent = vi.fn();
    const a = createServiceAnnouncer({ getWindow: () => win, onSent });

    expect(a.update(READY)).toBe(true);
    expect(win.webContents.send).toHaveBeenCalledWith("services-ready", READY);
    expect(onSent).toHaveBeenCalledWith(READY);
  });

  it("holds a status that arrives before the window, then sends it on flush", () => {
    let win = null;
    const onSent = vi.fn();
    const a = createServiceAnnouncer({ getWindow: () => win, onSent });

    expect(a.update(DEGRADED)).toBe(false);
    expect(onSent).not.toHaveBeenCalled();

    win = fakeWindow();
    expect(a.flush()).toBe(true);
    expect(win.webContents.send).toHaveBeenCalledWith(
      "services-ready",
      DEGRADED,
    );
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("sends each status once, however many times it is flushed", () => {
    const win = fakeWindow();
    const a = createServiceAnnouncer({ getWindow: () => win });
    a.update(READY);
    expect(a.flush()).toBe(false);
    expect(a.flush()).toBe(false);
    expect(win.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("sends again when a retry changes the status", () => {
    const win = fakeWindow();
    const a = createServiceAnnouncer({ getWindow: () => win });
    a.update(DEGRADED);
    a.update(READY);
    expect(win.webContents.send.mock.calls.map((c) => c[1])).toEqual([
      DEGRADED,
      READY,
    ]);
  });

  it("does nothing, and does not throw, if the window was destroyed", () => {
    const win = fakeWindow();
    win.destroyed = true;
    const onSent = vi.fn();
    const a = createServiceAnnouncer({ getWindow: () => win, onSent });
    expect(a.update(READY)).toBe(false);
    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it("does nothing before there is any status", () => {
    const win = fakeWindow();
    const a = createServiceAnnouncer({ getWindow: () => win });
    expect(a.flush()).toBe(false);
    a.replay(win);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it("replays the last status to a window that reloads", () => {
    const win = fakeWindow();
    const a = createServiceAnnouncer({ getWindow: () => win });
    a.update(DEGRADED);
    a.update(READY);
    win.webContents.send.mockClear();

    a.replay(win);
    expect(win.webContents.send).toHaveBeenCalledWith("services-ready", READY);
  });

  it("replays the newest status to a new window, even one nothing could receive yet", () => {
    const first = fakeWindow();
    let current = first;
    const a = createServiceAnnouncer({ getWindow: () => current });
    a.update(DEGRADED);
    first.destroyed = true;
    a.update(READY); // no live window: held, not sent

    const second = fakeWindow();
    a.replay(second);
    expect(second.webContents.send).toHaveBeenCalledWith(
      "services-ready",
      READY,
    );
  });

  it("does not replay to a destroyed window", () => {
    const win = fakeWindow();
    const a = createServiceAnnouncer({ getWindow: () => win });
    a.update(READY);
    win.webContents.send.mockClear();
    win.destroyed = true;
    a.replay(win);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});
