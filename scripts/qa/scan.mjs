// Find needles in every file under a directory, as UTF-8 and UTF-16LE.
//   node scripts/qa/scan.mjs <dir> <needle>...   -> JSON on stdout
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const count = (buf, needle) => {
  let n = 0;
  for (let i = buf.indexOf(needle); i !== -1; i = buf.indexOf(needle, i + 1))
    n++;
  return n;
};

/** @returns {{file: string, hits: Record<string, {utf8: number, utf16le: number}>}[]} files with hits only */
export function scanDir(dir, needles) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const buf = fs.readFileSync(p);
        const hits = {};
        for (const n of needles) {
          const utf8 = count(buf, Buffer.from(n, "utf8"));
          const utf16le = count(buf, Buffer.from(n, "utf16le"));
          if (utf8 || utf16le) hits[n] = { utf8, utf16le };
        }
        if (Object.keys(hits).length)
          out.push({ file: path.relative(dir, p), hits });
      }
    }
  };
  walk(dir);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, ...needles] = process.argv.slice(2);
  console.log(JSON.stringify(scanDir(dir, needles), null, 1));
  process.exit(0);
}
