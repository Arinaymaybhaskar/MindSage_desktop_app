// The shared AI queue (KAN-89). Background work (filling in an entry's title,
// mood, tags and summary) runs one job at a time, so an entry's calls run in
// order and only one model needs to be loaded; a job never starts while Ask is
// answering, and a call run through yieldToAsk stops for it. Pure: no electron
// or native imports.

let asking = 0;
let askDone = Promise.resolve();
let endAsk = () => {};
let tail = Promise.resolve();
let gate = null; // set while paused (a restart): no background job starts
let openGate = () => {};

/** Holds background jobs back; running and queued ones are kept, not dropped. */
export function pause() {
  gate ??= new Promise((resolve) => (openGate = resolve));
}

/** Lets the queued background jobs run again. */
export function resume() {
  openGate();
  gate = null;
}

const yielding = new Set(); // controllers of background AI calls running now

/**
 * Runs one AI call of a background job so that an Ask stops it at once
 * (KAN-390): a running call cannot be overtaken, only aborted. The call runs
 * again, with a fresh signal, once no Ask is running.
 */
export async function yieldToAsk(call) {
  for (;;) {
    while (asking) await askDone;
    const controller = new AbortController();
    yielding.add(controller);
    try {
      return await call(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) throw err;
    } finally {
      yielding.delete(controller);
    }
  }
}

/** Runs an Ask; background jobs wait until no Ask is running. */
export async function foreground(task) {
  if (asking++ === 0) askDone = new Promise((resolve) => (endAsk = resolve));
  for (const controller of yielding) controller.abort();
  try {
    return await task();
  } finally {
    if (--asking === 0) endAsk();
  }
}

/** Queues a background job behind every earlier one and behind Ask. */
export function background(task) {
  const run = tail.then(async () => {
    while (gate || asking) await (gate ?? askDone);
    return task();
  });
  tail = run.catch(() => {});
  return run;
}
