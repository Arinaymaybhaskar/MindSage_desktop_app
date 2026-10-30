import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

async function sha256Of(file) {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Downloads `url` to `dest` through `dest.part`, resuming a part an earlier
 * try left behind, and keeps the file only when its SHA-256 matches. A
 * mismatch deletes the part, so the next try starts clean. A `dest` already
 * there is fetched again unless its SHA-256 matches.
 *
 * @param {{ url: string, dest: string, sha256: string,
 *   onProgress?: (p: { done: number, total: number }) => void,
 *   signal?: AbortSignal, fetchImpl?: typeof fetch,
 *   redirect?: "follow" | "error" }} options
 * @returns {Promise<string>} dest
 */
export async function downloadFile({
  url,
  dest,
  sha256,
  onProgress,
  signal,
  fetchImpl = fetch,
  redirect = "follow",
}) {
  if (fs.existsSync(dest)) {
    // A file already there is kept only if it is the right one (KAN-492).
    if ((await sha256Of(dest)) === sha256) return dest;
    fs.rmSync(dest, { force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;

  const res = await fetchImpl(url, {
    headers: have ? { Range: `bytes=${have}-` } : {},
    signal,
    redirect,
  });
  if (res.status === 416) {
    // The part is already whole; the checksum below decides.
    await res.body?.cancel();
  } else {
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    if (res.status !== 206) have = 0; // the server ignored the range
    const total = have + Number(res.headers.get("content-length") ?? 0);
    let done = have;
    const count = new Transform({
      transform(chunk, _enc, cb) {
        done += chunk.length;
        onProgress?.({ done, total });
        cb(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(res.body),
      count,
      fs.createWriteStream(part, { flags: have ? "a" : "w" }),
      { signal },
    );
  }

  if ((await sha256Of(part)) !== sha256) {
    fs.rmSync(part, { force: true });
    throw new Error("Download failed: checksum mismatch");
  }
  fs.renameSync(part, dest);
  return dest;
}
