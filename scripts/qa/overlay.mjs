// Make sqlite-vec unloadable without touching the shared node_modules.
//   node scripts/qa/overlay.mjs make <worktree>      # search must go down, the app must not
//   node scripts/qa/overlay.mjs restore <worktree>
// <worktree>/node_modules (a symlink to the shared one) becomes a real
// directory of symlinks to the shared entries, except sqlite-vec and its
// platform package, which are stubs: the file exists but is not a library.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MARK = ".qa-overlay";

export function makeUnloadableVec(worktree) {
  const nm = path.join(worktree, "node_modules");
  const restoreCmd = `node scripts/qa/overlay.mjs restore ${worktree}`;
  if (fs.existsSync(path.join(nm, MARK)))
    return { path: nm, restoreCmd, restore: () => restore(worktree) };
  if (!fs.lstatSync(nm).isSymbolicLink())
    throw new Error(`${nm} is not a symlink to a shared node_modules`);
  const shared = fs.realpathSync(nm);
  fs.unlinkSync(nm);
  fs.mkdirSync(nm);
  fs.writeFileSync(path.join(nm, MARK), shared);
  for (const name of fs.readdirSync(shared)) {
    const target = path.join(nm, name);
    if (!name.startsWith("sqlite-vec")) {
      fs.symlinkSync(path.join(shared, name), target);
      continue;
    }
    fs.mkdirSync(target);
    const so = path.join(target, "vec0.so");
    fs.writeFileSync(so, "not a shared library\n");
    fs.writeFileSync(
      path.join(target, "package.json"),
      JSON.stringify({ name, version: "0.0.0-qa-stub", main: "index.cjs" }),
    );
    const lib = `module.exports = { getLoadablePath: () => ${JSON.stringify(so)} };\n`;
    fs.writeFileSync(path.join(target, "index.cjs"), lib);
  }
  return { path: nm, restoreCmd, restore: () => restore(worktree) };
}

export function restore(worktree) {
  const nm = path.join(worktree, "node_modules");
  const shared = fs.readFileSync(path.join(nm, MARK), "utf8");
  fs.rmSync(nm, { recursive: true }); // removes the links, never their targets
  fs.symlinkSync(shared, nm);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, wt = process.cwd()] = process.argv.slice(2);
  if (cmd === "make") console.log(makeUnloadableVec(path.resolve(wt)));
  else if (cmd === "restore") restore(path.resolve(wt));
  else console.error("usage: overlay.mjs make|restore <worktree>");
  process.exit(0);
}
