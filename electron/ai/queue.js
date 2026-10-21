// The shared AI queue (KAN-89). Background work (filling in an entry's title,
// mood, tags and summary) runs one job at a time, so an entry's calls run in
// order and only one model needs to be loaded; a job never starts while Ask is
// answering. Pure: no electron or native imports.

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

/** Runs an Ask; background jobs wait until no Ask is running. */
export async function foreground(task) {
  if (asking++ === 0) askDone = new Promise((resolve) => (endAsk = resolve));
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
