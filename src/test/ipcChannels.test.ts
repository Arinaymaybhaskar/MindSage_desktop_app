import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A renderer wrapper that invokes a channel nobody handles fails at run time
// with "No handler registered" (KAN-339), and the startup bench flags it.

const root = path.resolve(__dirname, "../..");
const walk = (dir: string, ext: RegExp): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory()
      ? walk(full, ext)
      : ext.test(e.name) && !/\.test\./.test(e.name)
        ? [full]
        : [];
  });

describe("IPC channels", () => {
  it("every channel a renderer wrapper invokes has a handler", () => {
    const handled = new Set<string>();
    for (const file of walk(path.join(root, "electron"), /\.js$/)) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/handle(?:Once)?\(\s*["']([\w:-]+)["']/g))
        handled.add(m[1]);
    }
    const missing: string[] = [];
    for (const file of walk(path.join(root, "src"), /\.tsx?$/)) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(
        /invoke(?:<[^>]*>)?\(\s*["']([\w:-]+)["']/g,
      ))
        if (!handled.has(m[1]))
          missing.push(`${path.relative(root, file)}: ${m[1]}`);
    }
    expect(handled.size).toBeGreaterThan(50); // the scan found the handlers
    expect(missing).toEqual([]);
  });
});
