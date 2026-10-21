import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import {
  runOllamaCli,
  CLI_TIMEOUT_MS,
  CLI_PIPE_GRACE_MS,
  CLI_MAX_BUFFER,
  killOllamaCliChildren,
} from "./ollamaCli.js";

afterEach(() => vi.useRealTimers());

// A stand-in for execFile whose callback the test fires (or never fires).
const fakeExecFile = () => {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stdout: { destroy: vi.fn() },
    stderr: { destroy: vi.fn() },
  });
  let callback;
  const impl = vi.fn((file, args, options, cb) => {
    callback = cb;
    return child;
  });
  return { impl, child, finish: (...a) => callback(...a) };
};

describe("runOllamaCli", () => {
  it("runs the binary directly (no shell) with a timeout, kill signal and buffer cap", async () => {
    const fake = fakeExecFile();
    const done = runOllamaCli(["--version"], { execFileImpl: fake.impl });
    fake.finish(null, "ollama version 0.5.1\n", "");
    expect(await done).toMatchObject({
      ok: true,
      stdout: "ollama version 0.5.1\n",
    });
    const [file, args, options] = fake.impl.mock.calls[0];
    expect(file).toBe("ollama");
    expect(args).toEqual(["--version"]);
    expect(options).toMatchObject({
      timeout: CLI_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: CLI_MAX_BUFFER,
    });
    expect(options.shell).toBeUndefined();
  });

  it("reports a missing binary as not ok without throwing", async () => {
    const fake = fakeExecFile();
    const done = runOllamaCli(["list"], { execFileImpl: fake.impl });
    fake.finish(
      Object.assign(new Error("spawn ollama ENOENT"), { code: "ENOENT" }),
      "",
      "",
    );
    expect(await done).toMatchObject({ ok: false, timedOut: false });
  });

  it("reports execFile's own timeout kill as timedOut", async () => {
    const fake = fakeExecFile();
    const done = runOllamaCli(["list"], { execFileImpl: fake.impl });
    fake.finish(Object.assign(new Error("killed"), { killed: true }), "", "");
    expect(await done).toMatchObject({ ok: false, timedOut: true });
  });

  it("gives up and kills the child when no callback ever comes", async () => {
    vi.useFakeTimers();
    const fake = fakeExecFile();
    let result;
    runOllamaCli(["list"], { execFileImpl: fake.impl }).then((r) => {
      result = r;
    });

    await vi.advanceTimersByTimeAsync(CLI_TIMEOUT_MS + CLI_PIPE_GRACE_MS - 1);
    expect(result).toBeUndefined();
    expect(fake.child.kill).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(result).toMatchObject({ ok: false, timedOut: true });
    expect(fake.child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(fake.child.stdout.destroy).toHaveBeenCalled();
    expect(fake.child.stderr.destroy).toHaveBeenCalled();
  });

  it("does not fire the backstop after a normal finish", async () => {
    vi.useFakeTimers();
    const fake = fakeExecFile();
    const done = runOllamaCli(["--version"], { execFileImpl: fake.impl });
    fake.finish(null, "ok", "");
    await done;
    await vi.advanceTimersByTimeAsync(CLI_TIMEOUT_MS * 3);
    expect(fake.child.kill).not.toHaveBeenCalled();
  });

  it("resolves not ok when execFile throws synchronously", async () => {
    const impl = vi.fn(() => {
      throw new Error("boom");
    });
    expect(await runOllamaCli(["list"], { execFileImpl: impl })).toMatchObject({
      ok: false,
    });
  });
});

// The real thing: a fake `ollama` that ignores everything and sleeps. Linux
// and macOS only (needs a shell script on PATH).
describe.skipIf(process.platform === "win32")("with a hung ollama", () => {
  it("kills a hung child and returns within the timeout", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-ollama-"));
    const bin = path.join(dir, "ollama");
    fs.writeFileSync(bin, "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });
    const oldPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${oldPath}`;
    try {
      const started = Date.now();
      const result = await runOllamaCli(["list"], {
        timeoutMs: 300,
        graceMs: 700,
      });
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(Date.now() - started).toBeLessThan(1500);
    } finally {
      process.env.PATH = oldPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// KAN-378: quitting while a probe runs must not leave the child behind.
describe.skipIf(process.platform === "win32")("killOllamaCliChildren", () => {
  it("kills a probe that is still running and settles it", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-ollama-"));
    fs.writeFileSync(path.join(dir, "ollama"), "#!/bin/sh\nexec sleep 600\n", {
      mode: 0o755,
    });
    const oldPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${oldPath}`;
    let pid;
    const spy = (file, args, options, cb) => {
      const child = execFile(file, args, options, cb);
      pid = child.pid;
      return child;
    };
    try {
      const pending = runOllamaCli(["list"], { execFileImpl: spy });
      expect(() => process.kill(pid, 0)).not.toThrow();
      killOllamaCliChildren();
      const result = await pending;
      expect(result.ok).toBe(false);
      await vi.waitFor(() =>
        expect(() => process.kill(pid, 0)).toThrow(/ESRCH/),
      );
    } finally {
      process.env.PATH = oldPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not touch a probe that already finished", async () => {
    const fake = fakeExecFile();
    const pending = runOllamaCli(["--version"], { execFileImpl: fake.impl });
    fake.finish(null, "ollama version 0.1.0", "");
    await pending;
    killOllamaCliChildren();
    expect(fake.child.kill).not.toHaveBeenCalled();
  });
});
