// Checks a user-chosen .gguf before the engine ever opens it: the engine is
// native code, so a file that is not a GGUF model is refused up front.
// Pure node:fs, so it is unit-tested without Electron.
import fs from "node:fs";
import path from "node:path";

const MAGIC = "GGUF";
const HEADER_BYTES = 24; // magic, version u32, tensor count u64, kv count u64
/** Smaller than this cannot hold a model that answers anything. */
const MIN_BYTES = 1024 * 1024;
const MAX_TENSORS = 100_000n;
const MAX_KV = 100_000n;

const notGguf = { ok: false, error: "That file is not a GGUF model." };

/**
 * shortcut: header sanity only (magic, version, counts), not the architecture
 * or the tensors; the engine still refuses a model it cannot run.
 *
 * @returns {{ ok: true, path: string, name: string, bytes: number }
 *   | { ok: false, error: string }}
 */
export function checkGguf(file) {
  if (
    typeof file !== "string" ||
    path.extname(file).toLowerCase() !== ".gguf"
  ) {
    return { ok: false, error: "Choose a file that ends in .gguf." };
  }
  let fd;
  try {
    const real = fs.realpathSync(file);
    const stat = fs.statSync(real);
    if (!stat.isFile() || stat.size < MIN_BYTES) {
      return { ok: false, error: "That file is too small to be a model." };
    }
    fd = fs.openSync(real, "r");
    const header = Buffer.alloc(HEADER_BYTES);
    if (fs.readSync(fd, header, 0, HEADER_BYTES, 0) < HEADER_BYTES) {
      return notGguf;
    }
    if (header.toString("latin1", 0, 4) !== MAGIC) return notGguf;
    const version = header.readUInt32LE(4);
    if (version < 2 || version > 3) {
      return { ok: false, error: `GGUF version ${version} is not supported.` };
    }
    const tensors = header.readBigUInt64LE(8);
    const kv = header.readBigUInt64LE(16);
    if (tensors === 0n || tensors > MAX_TENSORS || kv > MAX_KV) {
      return { ok: false, error: "That GGUF file looks damaged." };
    }
    return {
      ok: true,
      path: real,
      name: path.basename(real),
      bytes: stat.size,
    };
  } catch {
    return { ok: false, error: "That file could not be read." };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
