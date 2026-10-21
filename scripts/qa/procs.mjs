// Process helpers for QA. Never pkill: every process is owned by a pid file.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when something accepts a TCP connection on 127.0.0.1:port. */
export function portTaken(port, timeout = 1000) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    const done = (v) => (s.destroy(), resolve(v));
    s.setTimeout(timeout, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

export async function waitForPort(port, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100))
    if (await portTaken(port)) return true;
  return false;
}

const state = (pid) => {
  try {
    // "pid (comm) S ppid ...": comm may hold spaces, so cut at the last ")".
    return fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ").pop();
  } catch {
    return null;
  }
};
export const alive = (pid) => {
  const s = state(pid);
  return s !== null && !s.startsWith("Z");
};

/** Start a detached-from-nothing child, log to <pidfile>.log, write its pid. */
export function startTracked(cmd, args, pidfile, { env, cwd } = {}) {
  const out = fs.openSync(`${pidfile}.log`, "a");
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    cwd,
    stdio: ["ignore", out, out],
  });
  fs.writeFileSync(pidfile, String(child.pid));
  child.unref();
  return child.pid;
}

/** SIGTERM the pid in the file, SIGKILL after 5 s, then delete the file. */
export async function stopTracked(pidfile) {
  let pid;
  try {
    pid = Number(fs.readFileSync(pidfile, "utf8"));
  } catch {
    return false;
  }
  for (const sig of ["SIGTERM", "SIGKILL"]) {
    if (!alive(pid)) break;
    try {
      process.kill(pid, sig);
    } catch {}
    for (let i = 0; i < 50 && alive(pid); i++) await sleep(100);
  }
  fs.rmSync(pidfile, { force: true });
  return !alive(pid);
}

/** Live processes whose command line matches `match` (default: electron). */
export function listProcs(match = /electron/i) {
  const rows = [];
  for (const name of fs.readdirSync("/proc")) {
    const pid = Number(name);
    if (!pid || pid === process.pid || !alive(pid)) continue;
    try {
      const cmd = fs
        .readFileSync(`/proc/${pid}/cmdline`, "utf8")
        .replace(/\0/g, " ")
        .trim();
      if (cmd && match.test(cmd)) rows.push({ pid, cmd: cmd.slice(0, 160) });
    } catch {}
  }
  return rows;
}

/** Take this before launching; pass it to newOrphans after closing. */
export const baseline = (match) => listProcs(match).map((p) => p.pid);

/** Matching processes that were not in the baseline. Empty means clean. */
export const newOrphans = (base, match) =>
  listProcs(match).filter((p) => !base.includes(p.pid));
