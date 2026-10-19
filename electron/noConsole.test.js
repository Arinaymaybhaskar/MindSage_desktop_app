import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Main-process code logs through electron/log.js (KAN-170): console output is
// redacted by it, but a stray console call in new code goes unreviewed. These
// files still use console, each for a stated reason, and the list must only
// shrink.
const STILL_CONSOLE = [
  // A sandboxed preload may import only "electron".
  "preload.js",
  "splashPreload.js",
  // The logger itself.
  "log.js",
  "logSetup.js",
];

const root = path.resolve(__dirname);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

describe("main-process logging", () => {
  it("no new console calls outside the listed files", () => {
    const offenders = walk(root)
      .filter((f) => f.endsWith(".js") && !/\.test\.js$/.test(f))
      .map((f) => path.relative(root, f))
      .filter((rel) => !STILL_CONSOLE.includes(rel))
      .filter((rel) =>
        /\bconsole\.(log|info|warn|error|debug)\(/.test(
          fs.readFileSync(path.join(root, rel), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
