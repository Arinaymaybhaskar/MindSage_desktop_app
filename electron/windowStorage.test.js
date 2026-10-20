import { describe, it, expect, vi, beforeEach } from "vitest";

const makeSession = () => ({
  clearStorageData: vi.fn().mockResolvedValue(undefined),
  flushStorageData: vi.fn(),
});
const defaultSession = makeSession();
const otherSession = makeSession();
let windows = [];
vi.mock("electron", () => ({
  session: {
    get defaultSession() {
      return defaultSession;
    },
  },
  BrowserWindow: { getAllWindows: () => windows },
}));
const logError = vi.fn();
vi.mock("./log.js", () => ({ log: { error: (...a) => logError(...a) } }));

const { eraseLocalStorage, windowSessions } =
  await import("./windowStorage.js");

const win = (s, destroyed = false) => ({
  isDestroyed: () => destroyed,
  webContents: { session: s },
});

describe("eraseLocalStorage (KAN-376)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultSession.clearStorageData.mockResolvedValue(undefined);
    windows = [];
  });

  it("clears each window's session once, localStorage only", async () => {
    windows = [win(defaultSession), win(defaultSession), win(otherSession)];
    expect(windowSessions()).toEqual([defaultSession, otherSession]);
    expect(await eraseLocalStorage()).toBe(true);
    for (const s of [defaultSession, otherSession]) {
      expect(s.clearStorageData).toHaveBeenCalledTimes(1);
      expect(s.clearStorageData).toHaveBeenCalledWith({
        storages: ["localstorage"],
      });
      expect(s.flushStorageData).toHaveBeenCalledTimes(1);
    }
  });

  it("skips destroyed windows", () => {
    windows = [win(otherSession, true)];
    expect(windowSessions()).toEqual([defaultSession]);
  });

  it("reports a failure instead of throwing, and logs no storage contents", async () => {
    defaultSession.clearStorageData.mockRejectedValue(new Error("busy"));
    expect(await eraseLocalStorage()).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      "Could not clear the window storage:",
      "busy",
    );
  });
});
