import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../store.js", () => ({ modelStore: { get: vi.fn() } }));
vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { checkGguf } = await import("./gguf.js");
const { validateProvider } = await import("./providers.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-gguf-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A file with a GGUF header and enough padding to pass the size floor. */
function make(
  name,
  { magic = "GGUF", version = 3, tensors = 10n, kv = 5n } = {},
) {
  const file = path.join(dir, name);
  const buf = Buffer.alloc(2 * 1024 * 1024);
  buf.write(magic, 0, "latin1");
  buf.writeUInt32LE(version, 4);
  buf.writeBigUInt64LE(tensors, 8);
  buf.writeBigUInt64LE(kv, 16);
  fs.writeFileSync(file, buf);
  return file;
}

describe("checkGguf", () => {
  it("accepts a GGUF header", () => {
    const res = checkGguf(make("ok.gguf"));
    expect(res).toMatchObject({ ok: true, name: "ok.gguf" });
  });

  it("refuses a file without the GGUF magic", () => {
    expect(checkGguf(make("bad.gguf", { magic: "MZ\0\0" })).ok).toBe(false);
  });

  it("refuses an unknown version and absurd counts", () => {
    expect(checkGguf(make("v9.gguf", { version: 9 })).ok).toBe(false);
    expect(checkGguf(make("t0.gguf", { tensors: 0n })).ok).toBe(false);
    expect(checkGguf(make("big.gguf", { kv: 2n ** 40n })).ok).toBe(false);
  });

  it("refuses a wrong extension, a tiny file and a missing file", () => {
    const named = make("model.bin");
    expect(checkGguf(named).ok).toBe(false);
    const tiny = path.join(dir, "tiny.gguf");
    fs.writeFileSync(tiny, "GGUF");
    expect(checkGguf(tiny).ok).toBe(false);
    expect(checkGguf(path.join(dir, "missing.gguf")).ok).toBe(false);
    expect(checkGguf(undefined).ok).toBe(false);
  });

  it("is what validating the gguf provider runs", async () => {
    expect((await validateProvider("gguf", { path: make("v.gguf") })).ok).toBe(
      true,
    );
    expect((await validateProvider("gguf", { path: null })).ok).toBe(false);
  });
});

describe("validating Ollama", () => {
  it("asks to start Ollama when nothing answers", async () => {
    const down = async () => {
      throw new Error("ECONNREFUSED");
    };
    const res = await validateProvider("ollama", {}, down);
    expect(res).toEqual({
      ok: false,
      error: "Ollama is not running. Start Ollama, then try again.",
    });
  });

  it("passes when Ollama answers, and the built-in engine always passes", async () => {
    const up = async () => new Response("{}");
    expect((await validateProvider("ollama", {}, up)).ok).toBe(true);
    expect((await validateProvider("builtin")).ok).toBe(true);
    expect((await validateProvider("nope")).ok).toBe(false);
  });
});
