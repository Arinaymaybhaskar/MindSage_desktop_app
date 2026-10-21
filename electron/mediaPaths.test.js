import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  isInside,
  journalMediaDir,
  planFileRemoval,
  pruneEmptyDirs,
  removeThumbnails,
  thumbnailName,
} from "./mediaPaths.js";

const base = path.resolve("/data/MindSage/media");

describe("isInside", () => {
  it("accepts files in the media folder and its subfolders", () => {
    expect(isInside(base, path.join(base, "a.jpg"))).toBe(true);
    expect(isInside(base, path.join(base, "profile", "b.png"))).toBe(true);
  });

  it("refuses the folder itself, siblings, parents and traversal", () => {
    expect(isInside(base, base)).toBe(false);
    expect(
      isInside(base, path.resolve("/data/MindSage/media-evil/a.jpg")),
    ).toBe(false);
    expect(isInside(base, path.resolve("/data/MindSage/mind-sage.db"))).toBe(
      false,
    );
    expect(isInside(base, path.join(base, "..", "mind-sage.db"))).toBe(false);
    expect(isInside(base, path.join(base, "x", "..", "..", "secret"))).toBe(
      false,
    );
    expect(isInside(base, "/etc/passwd")).toBe(false);
  });

  it("refuses anything that is not a usable path", () => {
    for (const bad of [undefined, null, "", 42, {}]) {
      expect(isInside(base, bad)).toBe(false);
    }
    expect(isInside("", path.join(base, "a.jpg"))).toBe(false);
  });
});

describe("planFileRemoval", () => {
  it("removes our media, refuses the rest, skips blanks and repeats", () => {
    const mine = path.join(base, "photo.jpg");
    const plan = planFileRemoval(base, [
      mine,
      mine,
      null,
      undefined,
      "",
      "/etc/passwd",
      path.join(base, "..", "mind-sage.db"),
    ]);
    expect(plan.remove).toEqual([mine]);
    expect(plan.refused).toHaveLength(2);
  });

  it("copes with no keys at all", () => {
    expect(planFileRemoval(base, undefined)).toEqual({
      remove: [],
      refused: [],
    });
  });
});

describe("journalMediaDir", () => {
  it("is the entry's own folder inside media, whatever id it is given", () => {
    expect(journalMediaDir(base, 12)).toBe(path.join(base, "journals", "12"));
    expect(isInside(base, journalMediaDir(base, 12))).toBe(true);
    // An id that is not a number cannot steer the path out of the folder.
    expect(isInside(base, journalMediaDir(base, "../../etc"))).toBe(true);
    expect(journalMediaDir(base, "../../etc")).toBe(
      path.join(base, "journals", "NaN"),
    );
  });
});

describe("thumbnails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thumbs-"));
  const touch = (name) => fs.writeFileSync(path.join(dir, name), "x");

  it("every size of one photo shares a prefix that no other photo has", () => {
    const a = (w, m = 1, s = 1) => thumbnailName("/m/a.jpg", w, m, s);
    const prefix = (n) => n.split("-")[0];
    expect(prefix(a(320))).toBe(prefix(a(640)));
    expect(prefix(a(320, 5, 9))).toBe(prefix(a(480)));
    expect(a(320)).not.toBe(a(640));
    expect(prefix(thumbnailName("/m/b.jpg", 320, 1, 1))).not.toBe(
      prefix(a(320)),
    );
  });

  it("removes every width of the photo and nothing else, with or without the photo", () => {
    const mine = [320, 480, 640].map((w) => thumbnailName("/m/a.jpg", w, 1, 1));
    const other = thumbnailName("/m/b.jpg", 320, 1, 1);
    for (const n of [...mine, other, "stray.jpg"]) touch(n);
    expect(removeThumbnails(dir, "/m/a.jpg")).toBe(3);
    expect(fs.readdirSync(dir).sort()).toEqual([other, "stray.jpg"].sort());
    expect(removeThumbnails(dir, "/m/a.jpg")).toBe(0);
    expect(removeThumbnails(path.join(dir, "nope"), "/m/a.jpg")).toBe(0);
  });
});

describe("pruneEmptyDirs", () => {
  const make = () => fs.mkdtempSync(path.join(os.tmpdir(), "ms-prune-"));

  it("removes the chat folders a deleted attachment leaves empty, up to the media folder", () => {
    const media = make();
    try {
      const folder = path.join(media, "chats", "12", "3");
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, "1-photo.png");
      fs.writeFileSync(file, "x");
      fs.rmSync(file);
      expect(pruneEmptyDirs(media, file)).toBe(3);
      expect(fs.existsSync(path.join(media, "chats"))).toBe(false);
      expect(fs.existsSync(media)).toBe(true);
    } finally {
      fs.rmSync(media, { recursive: true, force: true });
    }
  });

  it("stops at a folder that still holds something", () => {
    const media = make();
    try {
      const keep = path.join(media, "chats", "12", "4");
      const gone = path.join(media, "chats", "12", "3");
      fs.mkdirSync(keep, { recursive: true });
      fs.mkdirSync(gone, { recursive: true });
      fs.writeFileSync(path.join(keep, "other.png"), "x");
      expect(pruneEmptyDirs(media, path.join(gone, "a.png"))).toBe(1);
      expect(fs.existsSync(keep)).toBe(true);
    } finally {
      fs.rmSync(media, { recursive: true, force: true });
    }
  });

  it("never walks out of the media folder", () => {
    const media = make();
    try {
      expect(pruneEmptyDirs(media, path.join(media, "..", "x.png"))).toBe(0);
      expect(fs.existsSync(media)).toBe(true);
    } finally {
      fs.rmSync(media, { recursive: true, force: true });
    }
  });
});
