import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { isUnpacked, unpackEngine, unpackedDir, untar } from "./cuda.js";

/** One ustar entry: header plus data padded to 512 bytes. */
function entry(name, text, type = "0") {
  const data = Buffer.from(text);
  const header = Buffer.alloc(512);
  header.write(name, 0, "latin1");
  header.write("0000644\0", 100, "latin1");
  header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write(type, 156, "latin1");
  header.write("ustar\0", 257, "latin1");
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}
const tgz = (...entries) =>
  zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));

const ENGINE = [
  entry("package/package.json", '{"version":"3.22.1"}'),
  entry("package/dist/index.js", "export {};"),
  entry("package/bins/win-x64-cuda/llama-addon.node", "addon"),
];

let dir;
let file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-cuda-"));
  file = path.join(dir, "win-x64-cuda-3.22.1.tgz");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("CUDA engine unpacking (KAN-434)", () => {
  it("reads regular files and skips folders and links", () => {
    const buf = Buffer.concat([
      entry("package/", "", "5"),
      entry("package/a.txt", "hello"),
      entry("package/link", "", "2"),
      Buffer.alloc(1024),
    ]);
    const files = untar(buf);
    expect(files.map((f) => f.name)).toEqual(["package/a.txt"]);
    expect(files[0].data.toString()).toBe("hello");
  });

  it("unpacks next to the tarball, then deletes the tarball", async () => {
    fs.writeFileSync(file, tgz(...ENGINE));
    const out = await unpackEngine(file);
    expect(out).toBe(unpackedDir(file));
    expect(isUnpacked(out)).toBe(true);
    expect(fs.readFileSync(path.join(out, "dist", "index.js"), "utf8")).toBe(
      "export {};",
    );
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(`${out}.tmp`)).toBe(false);
  });

  it("refuses a file that would land outside the engine folder", async () => {
    fs.writeFileSync(file, tgz(...ENGINE, entry("package/../../evil", "x")));
    await expect(unpackEngine(file)).rejects.toThrow(/unexpected file/);
    expect(fs.existsSync(path.join(dir, "..", "evil"))).toBe(false);
    expect(isUnpacked(unpackedDir(file))).toBe(false);
  });

  it("does not count an archive without the engine as installed", async () => {
    fs.writeFileSync(file, tgz(ENGINE[0], ENGINE[1]));
    await expect(unpackEngine(file)).rejects.toThrow(/missing its engine/);
    expect(isUnpacked(unpackedDir(file))).toBe(false);
    expect(fs.existsSync(file)).toBe(true); // kept: the next try unpacks again
  });
});
