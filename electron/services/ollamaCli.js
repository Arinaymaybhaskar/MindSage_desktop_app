/**
 * Bounded calls to the `ollama` CLI for the status checks (KAN-374).
 *
 * The startup probes used `exec("ollama list")` (no timeout) and
 * `exec("ollama --version", { timeout })`. `exec` runs a shell, and its
 * timeout kills only that shell: a hung `ollama` survived as an orphan holding
 * the stdout/stderr pipes, so the callback never fired, the status check never
 * finished and Electron could not shut down cleanly. `execFile` has no shell,
 * so the timeout kills `ollama` itself, and a backstop timer gives up on the
 * pipes if something still holds them open.
 *
 * Pure on purpose (no `electron`): `execFile` is injectable so the timeout and
 * kill behaviour are unit-tested with fake timers in `ollamaCli.test.js`.
 */
import { execFile } from "node:child_process";

/** How long a status probe (`--version`, `list`) may run before it is killed. */
export const CLI_TIMEOUT_MS = 5000;
/** Extra time after the kill for the pipes to close before we stop waiting. */
export const CLI_PIPE_GRACE_MS = 1000;
/** Output cap; a status probe prints a few lines. */
export const CLI_MAX_BUFFER = 1024 * 1024;

/** Probe children still running, so quitting can kill them (KAN-378). */
const live = new Set();

/**
 * Kills every probe still running. Called when the app quits: a child that
 * outlives the app is an orphan holding Electron's pipes, and the window
 * close never finishes.
 */
export function killOllamaCliChildren() {
  for (const child of live) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Already gone.
    }
  }
  live.clear();
}

/**
 * Runs `ollama <args>` and always resolves (never rejects) with
 * `{ ok, stdout, stderr, timedOut, error }`. `ok` is false for a missing
 * binary, a non-zero exit, a timeout or output over the cap.
 */
export function runOllamaCli(
  args,
  {
    timeoutMs = CLI_TIMEOUT_MS,
    graceMs = CLI_PIPE_GRACE_MS,
    execFileImpl = execFile,
  } = {},
) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let child;
    let backstop;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(backstop);
      live.delete(child);
      resolve(result);
    };

    try {
      child = execFileImpl(
        "ollama",
        args,
        {
          timeout: timeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: CLI_MAX_BUFFER,
          windowsHide: true,
          encoding: "utf8",
        },
        (error, stdout, stderr) => {
          finish({
            ok: !error,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            timedOut: timedOut || Boolean(error?.killed),
            error: error ?? null,
          });
        },
      );
    } catch (error) {
      return finish({
        ok: false,
        stdout: "",
        stderr: "",
        timedOut: false,
        error,
      });
    }

    if (child) live.add(child);

    // execFile's own timeout kills the child; this covers a child that is
    // gone but whose pipes something else still holds, so no callback comes.
    backstop = setTimeout(() => {
      timedOut = true;
      try {
        child?.kill?.("SIGKILL");
        child?.stdout?.destroy?.();
        child?.stderr?.destroy?.();
      } catch {
        // Already gone.
      }
      finish({
        ok: false,
        stdout: "",
        stderr: "",
        timedOut: true,
        error: new Error(`ollama ${args.join(" ")} timed out`),
      });
    }, timeoutMs + graceMs);
  });
}
