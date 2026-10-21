import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { downloadFile } from "./download.js";

const BYTES = Buffer.from("a GGUF file, or near enough for a test");
const SHA = createHash("sha256").update(BYTES).digest("hex");

/** A server that honours Range, like Hugging Face's CDN. */
const server = vi.fn(async (_url, { headers }) => {
  const from = Number(/bytes=(\d+)-/.exec(headers.Range ?? "")?.[1] ?? 0);
  return new Response(BYTES.subarray(from), {
    status: from ? 206 : 200,
    headers: { "content-length": String(BYTES.length - from) },
  });
});

let dir;
let dest;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-download-"));
  dest = path.join(dir, "models", "model.gguf");
  server.mockClear();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("downloadFile", () => {
  it("downloads, checks the SHA-256 and keeps the file", async () => {
    const progress = [];
    await downloadFile({
      url: "u",
      dest,
      sha256: SHA,
      fetchImpl: server,
      onProgress: (p) => progress.push(p),
    });
    expect(fs.readFileSync(dest)).toEqual(BYTES);
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
    expect(progress.at(-1)).toEqual({
      done: BYTES.length,
      total: BYTES.length,
    });
  });

  it("resumes a cut download from where the part ends", async () => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.part`, BYTES.subarray(0, 10));
    await downloadFile({ url: "u", dest, sha256: SHA, fetchImpl: server });
    expect(server.mock.calls[0][1].headers.Range).toBe("bytes=10-");
    expect(fs.readFileSync(dest)).toEqual(BYTES);
  });

  it("deletes the part and fails on a checksum mismatch", async () => {
    await expect(
      downloadFile({
        url: "u",
        dest,
        sha256: "0".repeat(64),
        fetchImpl: server,
      }),
    ).rejects.toThrow(/checksum mismatch/);
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
  });

  it("does not download a file that is already there", async () => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, BYTES);
    await downloadFile({ url: "u", dest, sha256: SHA, fetchImpl: server });
    expect(server).not.toHaveBeenCalled();
  });
});
