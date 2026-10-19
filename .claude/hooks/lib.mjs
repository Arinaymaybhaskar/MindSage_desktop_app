// Shared helpers for the project hooks. Node built-ins only. Every hook
// fails OPEN: any unexpected error means exit 0 and no output.
import { execFileSync } from "node:child_process";

export function readStdinJson() {
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(null), 3000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      try {
        const v = JSON.parse(data);
        resolve(v && typeof v === "object" ? v : null);
      } catch {
        resolve(null);
      }
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

export function git(args, cwd, timeout = 3000) {
  return execFileSync("git", args, {
    cwd: cwd || undefined,
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim();
}

export function currentBranch(cwd) {
  try {
    return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  } catch {
    // An unborn branch (no commits yet) makes rev-parse fail.
    try {
      return git(["symbolic-ref", "--short", "-q", "HEAD"], cwd);
    } catch {
      return null;
    }
  }
}

/** Block the tool call: message goes to stderr, exit 2. */
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
