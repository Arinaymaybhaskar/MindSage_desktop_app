// Work in the window that a restart would lose. Screens that hold text the
// user has not saved register here; restarting to install an update asks
// first, so an update never takes a draft with it.

export interface UnsavedWorkGuard {
  /** Write what can be written down now (a draft), so a restart keeps it. */
  flush?: () => void;
  /** True when there is work a restart would lose even after flush(). */
  isDirty?: () => boolean;
}

const guards = new Set<UnsavedWorkGuard>();

/** Returns the function that unregisters the guard. */
export function registerUnsavedWork(guard: UnsavedWorkGuard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export type RestartCheck = { ok: true } | { ok: false; reason: string };

export const UNSAVED_REASON =
  "Save or close the entry you are editing first, then restart.";

/** Flushes every guard, then reports whether anything would still be lost. */
export function prepareToRestart(): RestartCheck {
  let blocked = false;
  for (const guard of guards) {
    try {
      guard.flush?.();
    } catch {
      blocked = true; // a draft that could not be written is not safe
    }
    try {
      if (guard.isDirty?.()) blocked = true;
    } catch {
      blocked = true;
    }
  }
  return blocked ? { ok: false, reason: UNSAVED_REASON } : { ok: true };
}
