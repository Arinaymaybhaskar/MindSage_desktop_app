import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Settings tabs are chosen by path ("/settings/security"), not by hash. A link
// written as "/settings#security" opens the Profile tab instead (KAN-359).

const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const sources = walk(path.join(root, "src")).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f),
);

const tabKeys = (() => {
  const text = fs.readFileSync(
    path.join(root, "src/pages/settings.tsx"),
    "utf8",
  );
  const block = text.split(
    "settingsSections: Record<string, SettingsSection> = {",
  )[1];
  const body = block.split("\n};")[0];
  return [...body.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
})();

describe("settings links", () => {
  it("reads the tab keys out of settings.tsx", () => {
    expect(tabKeys).toContain("security");
    expect(tabKeys).toContain("profile");
  });

  it("no link selects a Settings tab with a hash", () => {
    const offenders = sources.filter((f) =>
      /["'`]\/settings#/.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("every /settings/<tab> link names a real tab", () => {
    const bad: string[] = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/["'`]\/settings\/([a-z]+)/g)) {
        if (m[1] !== "*" && !tabKeys.includes(m[1]))
          bad.push(`${path.relative(root, file)}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
