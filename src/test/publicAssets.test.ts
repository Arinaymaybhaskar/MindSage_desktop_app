import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The packaged app loads index.html from disk (file://), so a source file that
// asks for a public/ asset with a leading slash ("/emojis/1.png") requests
// file:///emojis/1.png and gets nothing (KAN-340). Use import.meta.env.BASE_URL,
// an import, or new URL(..., import.meta.url) instead.

const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

describe("public assets", () => {
  it("no renderer source requests a public/ asset by an absolute path", () => {
    const publicNames = fs
      .readdirSync(path.join(root, "public"))
      .map((n) => n.replace(/\.[^.]+$/, "") && n);
    const sources = walk(path.join(root, "src")).filter(
      (f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\./.test(f),
    );
    const offenders: string[] = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8");
      for (const name of publicNames) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // A quoted string starting with /<name>, not wrapped in new URL(...).
        const re = new RegExp(`(?<!new URL\\()["'\`]/${esc}(?:/|["'\`])`, "g");
        if (re.test(text))
          offenders.push(`${path.relative(root, file)}: /${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
