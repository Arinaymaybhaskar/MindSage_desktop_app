// The optional CUDA engine for Nvidia GPUs (KAN-434). The installer ships the
// CPU and Vulkan builds of llama.cpp only. This build is the "cuda-engine"
// download (models.js), fetched by the shared downloader, which checks its
// SHA-256 before anything here opens it. It is unpacked next to the models and
// node-llama-cpp finds it through a module resolve hook, so no file is written
// into the install folder and an update keeps it. No electron import.
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

/** The package node-llama-cpp imports for its Windows CUDA build. */
export const CUDA_PACKAGE = "@node-llama-cpp/win-x64-cuda";
const ADDON = path.join("bins", "win-x64-cuda", "llama-addon.node");
const ENTRY = path.join("dist", "index.js");

export const cudaSupported = () =>
  process.platform === "win32" && process.arch === "x64";

/** Where a downloaded tarball is unpacked: its own path without ".tgz". */
export const unpackedDir = (tgz) => tgz.replace(/\.tgz$/, "");

/** Unpacking ends with a rename, so a folder that has both files is whole. */
export const isUnpacked = (dir) =>
  fs.existsSync(path.join(dir, ENTRY)) && fs.existsSync(path.join(dir, ADDON));

/**
 * Regular files of a ustar archive, as { name, data }. Links, folders and
 * extended headers are skipped: an npm tarball needs none of them.
 */
export function untar(buf) {
  const files = [];
  for (let at = 0; at + 512 <= buf.length;) {
    const header = buf.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) =>
      header.toString("latin1", start, start + len).replace(/\0[\s\S]*$/, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || at + 512 + size > buf.length) {
      throw new Error("The CUDA engine archive is damaged");
    }
    const type = field(156, 1);
    const prefix = field(257, 6).startsWith("ustar") ? field(345, 155) : "";
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    if (type === "0" || type === "") {
      files.push({ name, data: buf.subarray(at + 512, at + 512 + size) });
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/**
 * Unpacks a downloaded (already SHA-256 checked) engine tarball into
 * unpackedDir(tgz), then deletes the tarball. Writes to a .tmp folder first, so
 * a cut unpack never looks installed. Every path must stay inside the folder.
 * shortcut: the whole archive is held in memory (about 300 MB at peak, once),
 * stream it if the engine grows.
 */
export async function unpackEngine(tgz) {
  const dir = unpackedDir(tgz);
  const tmp = `${dir}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  const buf = await promisify(zlib.gunzip)(await fs.promises.readFile(tgz));
  for (const { name, data } of untar(buf)) {
    const rel = name.replace(/^package\//, "");
    const dest = path.resolve(tmp, rel);
    if (rel === name || !dest.startsWith(tmp + path.sep)) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error("The CUDA engine archive has an unexpected file");
    }
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, data);
  }
  if (!isUnpacked(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error("The CUDA engine archive is missing its engine");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  fs.rmSync(tgz, { force: true });
  return dir;
}

let hooked = false;
/**
 * Points node-llama-cpp's import of CUDA_PACKAGE at the unpacked download,
 * checked on every resolve, so an engine unpacked later is found by the next
 * engine start. Without it the import fails and node-llama-cpp moves on to
 * Vulkan, then the CPU. Needs module.registerHooks (Node 22.15+, Electron 37).
 */
export function useDownloadedCuda(dir) {
  if (hooked || !cudaSupported() || typeof module.registerHooks !== "function")
    return;
  hooked = true;
  const url = pathToFileURL(path.join(dir, ENTRY)).href;
  module.registerHooks({
    resolve: (specifier, context, next) =>
      specifier === CUDA_PACKAGE && isUnpacked(dir)
        ? { url, shortCircuit: true }
        : next(specifier, context),
  });
}
