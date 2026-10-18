// What to do when the app is activated with no visible main window (macOS: the
// dock icon after the last window was closed). Kept free of electron imports
// so it can be tested. KAN-337.
//
// An existing window is just shown. Otherwise a new one is created, handed to
// `adopt` (so main.js keeps its reference), told how services ended up through
// `onCreated` (the announcer replay), and shown once it can paint - a window
// created hidden is otherwise never revealed, because the one-time
// "visually ready" gate has already been used.

export function createReopener({ getWindow, create, adopt, onCreated }) {
  let creating = null;

  return async function reopen() {
    const existing = getWindow();
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized?.()) existing.restore();
      existing.show();
      existing.focus?.();
      return existing;
    }
    // A second activation while the first is still creating does nothing new.
    creating ??= (async () => {
      const win = await create();
      adopt(win);
      onCreated(win);
      win.once("ready-to-show", () => {
        if (!win.isDestroyed()) win.show();
      });
      return win;
    })().finally(() => {
      creating = null;
    });
    return creating;
  };
}
