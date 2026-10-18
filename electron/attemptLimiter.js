// Counts wrong passwords for a destructive action and locks it for a while
// after too many in a row, so a person at an unlocked screen cannot guess their
// way to "delete everything". In memory on purpose: it only has to outlast
// someone sitting at the keyboard, and a restart is a fresh start for the
// real owner. Pure (the clock is passed in), so it is tested without timers.

export function createAttemptLimiter({
  maxAttempts = 5,
  lockMs = 60_000,
  now = () => Date.now(),
} = {}) {
  const state = new Map(); // key -> { failures, lockedUntil }

  return {
    /** null when an attempt is allowed, else the seconds left on the lock. */
    lockedFor(key) {
      const s = state.get(key);
      if (!s || !s.lockedUntil) return null;
      const left = s.lockedUntil - now();
      if (left <= 0) {
        state.delete(key); // lock over: a clean slate
        return null;
      }
      return Math.ceil(left / 1000);
    },

    /** Records a wrong password; returns how many attempts remain (0 = locked). */
    fail(key) {
      const s = state.get(key) ?? { failures: 0, lockedUntil: 0 };
      s.failures += 1;
      if (s.failures >= maxAttempts) s.lockedUntil = now() + lockMs;
      state.set(key, s);
      return Math.max(0, maxAttempts - s.failures);
    },

    /** A correct password clears the count. */
    succeed(key) {
      state.delete(key);
    },
  };
}
