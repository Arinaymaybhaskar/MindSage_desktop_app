import { beforeEach, describe, expect, it, vi } from "vitest";

// KAN-337: creating the window again (macOS reopen) must not register the
// window-control and open-external channels again.
const on = vi.fn();
const handle = vi.fn();
vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  ipcMain: { on, handle },
  nativeTheme: { shouldUseDarkColors: false },
  shell: { openExternal: vi.fn() },
}));

const { registerWindowIpc } = await import("./windowManager.js");

beforeEach(() => {
  on.mockClear();
  handle.mockClear();
});

describe("registerWindowIpc", () => {
  it("registers each channel once, however often it is called", () => {
    registerWindowIpc();
    registerWindowIpc();
    registerWindowIpc();
    const channels = [...on.mock.calls, ...handle.mock.calls].map((c) => c[0]);
    expect(channels.sort()).toEqual(
      [
        "close-window",
        "maximize-window",
        "minimize-window",
        "open-external",
      ].sort(),
    );
  });
});
