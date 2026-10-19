import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeLegacyQdrantData } from "./legacyQdrant.js";

const dirs = [];
const temp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-qdrant-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("removeLegacyQdrantData", () => {
  it("removes the Qdrant folder and leaves the database and media alone", async () => {
    const d = temp();
    fs.mkdirSync(path.join(d, "qdrant-data", "collections"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(d, "qdrant-data", "collections", "x"), "v");
    fs.writeFileSync(path.join(d, "mind-sage.db"), "journal");
    fs.mkdirSync(path.join(d, "media"));
    expect(await removeLegacyQdrantData(d)).toEqual({ removed: true });
    expect(fs.existsSync(path.join(d, "qdrant-data"))).toBe(false);
    expect(fs.readFileSync(path.join(d, "mind-sage.db"), "utf8")).toBe(
      "journal",
    );
    expect(fs.existsSync(path.join(d, "media"))).toBe(true);
  });

  it("does nothing when there is no such folder", async () => {
    expect(await removeLegacyQdrantData(temp())).toEqual({ removed: false });
  });
});
