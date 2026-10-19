// PreToolUse (Edit|Write|NotebookEdit): no file edits on main, dev or phase/*.
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { readStdinJson, git, currentBranch, block } from "./lib.mjs";

function realish(p) {
  // realpath of the nearest existing ancestor, plus the remaining tail
  let cur = p;
  const tail = [];
  while (!existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  return path.join(realpathSync(cur), ...tail);
}

let verdict = null;
try {
  const input = await readStdinJson();
  const cwd = input?.cwd || process.cwd();
  const ti = input?.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  if (typeof target === "string" && target) {
    const top = realpathSync(git(["rev-parse", "--show-toplevel"], cwd));
    const abs = realish(path.resolve(cwd, target));
    let rel = path.relative(top, abs);
    if (process.platform === "win32")
      rel = path.relative(top.toLowerCase(), abs.toLowerCase());
    const inside = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    if (inside) {
      const branch = currentBranch(top);
      if (
        branch &&
        (branch === "main" || branch === "dev" || branch.startsWith("phase/"))
      ) {
        verdict =
          `Blocked by CLAUDE.md (Branching and workflow): this checkout is on '${branch}', and direct work on main, dev or phase/* is forbidden. ` +
          `Create a ticket branch first, e.g. \`git checkout -b <type>/<KEY>-<slug>\` (such as feat/KAN-52-trash), do the work there, and merge it with --no-ff.`;
      }
    }
  }
} catch {
  verdict = null; // fail open
}
if (verdict) block(verdict);
process.exit(0);
