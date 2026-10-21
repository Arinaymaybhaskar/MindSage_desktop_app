import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addPending,
  pendingCount,
  readPending,
  removePath,
  retryPending,
} from "./pendingDeletions.js";

let root;
let media;
let list;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ms-pending-"));
  media = path.join(root, "media");
  fs.mkdirSync(media);
  list = path.join(root, "pending.json");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("pending deletions", () => {
  it("starts empty and tolerates a damaged file", () => {
    expect(readPending(list)).toEqual([]);
    fs.writeFileSync(list, "{not json");
    expect(readPending(list)).toEqual([]);
    fs.writeFileSync(list, JSON.stringify({ a: 1 }));
    expect(readPending(list)).toEqual([]);
  });

  it("remembers paths inside the media folder, once each, and refuses others", () => {
    const a = path.join(media, "journals", "1", "a.png");
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, "x");
    addPending(list, media, [a, a, path.join(root, "elsewhere.txt")]);
    expect(readPending(list)).toEqual([a]);
    expect(pendingCount(list)).toBe(1);
  });

  it("counts files, not the folders they sit in (KAN-384)", () => {
    // A locked photo leaves both the photo and its entry folder listed.
    const dir = path.join(media, "journals", "5");
    const photo = path.join(dir, "photo.png");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(photo, "x");
    addPending(list, media, [photo, dir]);
    expect(pendingCount(list)).toBe(1);
    fs.writeFileSync(path.join(dir, "voice.wav"), "x");
    expect(pendingCount(list)).toBe(2);
    fs.rmSync(dir, { recursive: true });
    expect(pendingCount(list)).toBe(0);
  });

  it("drops a path once it is removed, keeps one that still fails", () => {
    const ok = path.join(media, "ok.png");
    const stuck = path.join(media, "stuck.png");
    fs.writeFileSync(ok, "x");
    fs.writeFileSync(stuck, "x");
    addPending(list, media, [ok, stuck]);
    const r = retryPending(list, media, (p) => {
      if (p === stuck) throw new Error("EBUSY");
      removePath(p);
    });
    expect(r).toEqual({ removed: 1, remaining: 1 });
    expect(fs.existsSync(ok)).toBe(false);
    expect(readPending(list)).toEqual([stuck]);

    const again = retryPending(list, media, removePath);
    expect(again).toEqual({ removed: 1, remaining: 0 });
    expect(fs.existsSync(list)).toBe(false);
  });

  it("removes a pending folder with everything in it, and a missing path counts as done", () => {
    const dir = path.join(media, "journals", "7");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "x.wav"), "x");
    addPending(list, media, [dir, path.join(media, "never-existed")]);
    expect(retryPending(list, media, removePath)).toEqual({
      removed: 2,
      remaining: 0,
    });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("never follows a path that was edited to point outside the media folder", () => {
    const outside = path.join(root, "precious.txt");
    fs.writeFileSync(outside, "keep");
    fs.writeFileSync(list, JSON.stringify([outside]));
    expect(retryPending(list, media, removePath)).toEqual({
      removed: 0,
      remaining: 0,
    });
    expect(fs.existsSync(outside)).toBe(true);
  });
});
