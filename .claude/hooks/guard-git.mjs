// PreToolUse (Bash): block pushes to main/dev, unsafe force pushes, commits
// with Co-Authored-By / Claude-Session trailers, and commits that skip hooks.
// Parsing is deliberately conservative: when in doubt, allow.
import { readFileSync } from "node:fs";
import path from "node:path";
import { readStdinJson, currentBranch, block } from "./lib.mjs";

/** Split a command line into segments at unquoted ; && || | and newlines. */
function splitSegments(cmd) {
  const segs = [];
  let cur = "";
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      cur += c;
      if (c === "\\" && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else if (c === q) q = null;
      continue;
    }
    if (c === "\\" && i + 1 < cmd.length) {
      cur += c + cmd[++i];
    } else if (c === "'" || c === '"') {
      q = c;
      cur += c;
    } else if (c === ";" || c === "|" || c === "&" || c === "\n") {
      segs.push(cur);
      cur = "";
    } else cur += c;
  }
  segs.push(cur);
  return segs.map((s) => s.trim()).filter(Boolean);
}

/** Shell-like word split (quotes removed, no expansion). */
function tokenize(seg) {
  const out = [];
  let cur = "";
  let has = false;
  let q = null;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) {
      if (c === "\\" && q === '"' && i + 1 < seg.length) cur += seg[++i];
      else if (c === q) q = null;
      else cur += c;
    } else if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === "\\" && i + 1 < seg.length) {
      cur += seg[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/** Index of the git subcommand token, skipping env assignments and git options. */
function gitSub(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (path.basename(tokens[i] || "").replace(/\.exe$/i, "") !== "git")
    return -1;
  i++;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(
      tokens[i],
    )
      ? 2
      : 1;
  }
  return i < tokens.length ? i : -1;
}

const PROTECTED = ["main", "dev"];
const FORCE_OK = (b) => b.startsWith("claude/") || b.startsWith("backup/");

function checkPush(args, cwd) {
  let force = false;
  let lease = false;
  let all = false;
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (
      a === "--force-with-lease" ||
      a.startsWith("--force-with-lease=") ||
      a === "--force-if-includes"
    )
      lease = true;
    else if (a === "--force" || (/^-[A-Za-z]+$/.test(a) && a.includes("f")))
      force = true;
    else if (a === "--all" || a === "--mirror") all = true;
    else if (
      ["-o", "--push-option", "--repo", "--receive-pack", "--exec"].includes(a)
    )
      i++;
    else if (a.startsWith("-")) continue;
    else pos.push(a);
  }
  if (all) return "`git push --all/--mirror` would push main and dev";
  const refspecs = pos.slice(1);
  let current;
  const lookup = () =>
    current === undefined ? (current = currentBranch(cwd)) : current;
  const targets = [];
  if (refspecs.length === 0) {
    const b = lookup();
    if (b && b !== "HEAD") targets.push(b);
  }
  for (const r of refspecs) {
    if (r.startsWith("+")) force = true;
    let dst = r.replace(/^\+/, "");
    if (dst.includes(":")) dst = dst.split(":").pop();
    dst = dst.replace(/^refs\/heads\//, "");
    if (dst === "HEAD") {
      const b = lookup();
      if (!b || b === "HEAD") continue;
      dst = b;
    }
    if (dst) targets.push(dst);
  }
  const hit = targets.find((t) => PROTECTED.includes(t));
  if (hit) return `pushing to '${hit}' directly`;
  if (force || lease) {
    if (force)
      return "force-pushing (only --force-with-lease on claude/* or backup/* branches is allowed)";
    if (targets.length === 0 || !targets.every(FORCE_OK))
      return "--force-with-lease is only allowed on claude/* and backup/* branches";
  }
  return null;
}

function checkCommit(args) {
  const valueFlags = new Set([
    "-m",
    "-F",
    "-C",
    "-c",
    "-t",
    "--message",
    "--file",
    "--author",
    "--date",
    "--template",
    "--reuse-message",
    "--reedit-message",
    "--fixup",
    "--squash",
    "--cleanup",
    "--pathspec-from-file",
  ]);
  let noVerify = false;
  const texts = [];
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--no-verify") noVerify = true;
    else if (a.startsWith("--")) {
      const [k, ...rest] = a.split("=");
      if (rest.length) {
        texts.push(rest.join("="));
        if (k === "--file") files.push(rest.join("="));
      } else if (valueFlags.has(a) && i + 1 < args.length) {
        const v = args[++i];
        texts.push(v);
        if (a === "--file") files.push(v);
      }
    } else if (/^-[A-Za-z]+$/.test(a)) {
      const letters = a.slice(1);
      const lastIdx = letters.length - 1;
      for (let k = 0; k < letters.length; k++) {
        const L = letters[k];
        if (L === "n") noVerify = true;
        if (valueFlags.has("-" + L)) {
          if (k < lastIdx) {
            const v = letters.slice(k + 1);
            texts.push(v); // e.g. -mmessage
            if (L === "F") files.push(v);
          } else if (i + 1 < args.length) {
            const v = args[++i];
            texts.push(v);
            if (L === "F") files.push(v);
          }
          break;
        }
      }
    } else if (a.startsWith("-m")) texts.push(a.slice(2));
  }
  return { noVerify, texts, files };
}

let verdict = null;
try {
  const input = await readStdinJson();
  if (input?.tool_name && input.tool_name !== "Bash") process.exit(0);
  const cmd = input?.tool_input?.command;
  const cwd = input?.cwd || process.cwd();
  if (typeof cmd === "string" && /\bgit\b/.test(cmd)) {
    for (const seg of splitSegments(cmd)) {
      const tokens = tokenize(seg);
      const s = gitSub(tokens);
      if (s < 0) continue;
      const sub = tokens[s];
      const args = tokens.slice(s + 1);
      if (sub === "push") {
        const why = checkPush(args, cwd);
        if (why)
          verdict = `Blocked by CLAUDE.md (Branching and workflow): ${why}. Flow is ticket branch -> phase branch -> dev -> main, each landing by merge or PR; never push main or dev directly, and force-push nothing except --force-with-lease on claude/* or backup/* branches.`;
      } else if (sub === "commit") {
        const { noVerify, texts, files } = checkCommit(args);
        if (noVerify)
          verdict =
            "Blocked by CLAUDE.md (Other tooling): `git commit --no-verify` / `-n` skips the pre-commit hook (gitleaks, lint-staged). Fix what the hook reports instead of bypassing it.";
        const all = [...texts];
        for (const f of files) {
          if (f === "-") continue;
          try {
            all.push(readFileSync(path.resolve(cwd, f), "utf8"));
          } catch {
            /* unreadable: cannot tell, allow */
          }
        }
        if (/<<-?\s*['"]?\w+/.test(cmd)) all.push(cmd); // heredoc message
        if (all.some((t) => /co-authored-by|claude-session/i.test(t)))
          verdict =
            "Blocked by CLAUDE.md (Commits): commit messages carry no Co-Authored-By or Claude-Session trailers (nor model names or a 'Generated with' footer). Remove the trailer and commit again.";
      }
      if (verdict) break;
    }
  }
} catch {
  verdict = null; // fail open
}
if (verdict) block(verdict);
process.exit(0);
