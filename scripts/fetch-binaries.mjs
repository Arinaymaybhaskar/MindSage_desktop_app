// Fetches the native binaries listed in resources/binaries.json from a GitHub
// Release and verifies each sha256 (KAN-193). Runs as `prebuild`/`prerelease`.
// Files already present with the right hash are kept, so CI can cache resources/.
// MS_BINARIES_BASE_URL overrides the release URL (mirror or local test server).
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "resources");
const manifest = JSON.parse(
  await readFile(join(root, "binaries.json"), "utf8"),
);
const base = (process.env.MS_BINARIES_BASE_URL || manifest.release).replace(
  /\/$/,
  "",
);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function fail(msg) {
  console.error(`fetch-binaries: ${msg}`);
  process.exit(1);
}

let fetched = 0;
for (const { path, sha256 } of manifest.files) {
  const dest = join(root, path);
  const have = await readFile(dest).catch(() => null);
  if (have && sha(have) === sha256) continue;

  const url = `${base}/${basename(path)}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    fail(
      `missing ${path}: cannot download ${url} (${err.cause?.code || err.message}). ` +
        "Offline? Run npm run fetch:binaries once online, or set MS_BINARIES_BASE_URL.",
    );
  }
  if (!res.ok) fail(`missing ${path}: ${url} answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha(buf);
  if (got !== sha256)
    fail(`checksum mismatch for ${path}: expected ${sha256}, got ${got}`);

  await mkdir(dirname(dest), { recursive: true });
  await writeFile(`${dest}.part`, buf);
  await rm(dest, { force: true });
  await rename(`${dest}.part`, dest);
  fetched++;
  console.log(`fetched ${path}`);
}
console.log(
  `binaries ok (${fetched} fetched, ${manifest.files.length - fetched} already present)`,
);
