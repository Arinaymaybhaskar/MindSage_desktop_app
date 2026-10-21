// Token usage report for a Claude Code session transcript (.jsonl).
// Usage: node scripts/token-report.mjs [session.jsonl] (default: newest)
import { createReadStream, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
const proj = process.cwd().replace(/[\\/:_]/g, "-");
const dir = join(homedir(), ".claude", "projects", proj);
const names = process.argv[2]
  ? []
  : readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
const mtime = (f) => statSync(join(dir, f)).mtimeMs;
const newest = names.sort((a, b) => mtime(b) - mtime(a))[0];
const file = process.argv[2] ?? join(dir, newest);
const main = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};
const calls = []; // Agent tool_use blocks, in file order
const seen = new Set(); // de-duplicated notification tuples
const agents = []; // { name, model, effort, tokens, tools, ms }
const NOTE =
  /<summary>Agent \\"(.+?)\\" (?:finished|failed)[^<]*<\/summary>(?:(?!<summary>)[\s\S])*?<subagent_tokens>(\d+)<\/subagent_tokens><tool_uses>(\d+)<\/tool_uses><duration_ms>(\d+)/g;
let turns = 0;
function parse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
const input = createReadStream(file);
for await (const line of createInterface({ input, crlfDelay: Infinity })) {
  const rec = parse(line);
  const msg = rec.message ?? {};
  if (msg.usage) {
    turns++;
    for (const k in main) main[k] += msg.usage[k] ?? 0;
  }
  for (const b of Array.isArray(msg.content) ? msg.content : []) {
    if (b.name === "Agent") calls.push({ ...b.input, matched: false });
  }
  const hits = JSON.stringify(rec).matchAll(NOTE);
  for (const [, name, tokens, tools, ms] of hits) {
    const key = [name, tokens, tools, ms].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const call = calls.findLast((c) => !c.matched && c.description === name);
    if (call) call.matched = true;
    const model = call?.model ?? "unknown";
    agents.push({ name, model, effort: call?.effort, tokens: +tokens });
  }
}
const n = (x) => x.toLocaleString("en-US");
const groups = new Map();
for (const a of agents) {
  const k = a.effort ? `${a.model} (effort ${a.effort})` : a.model;
  const g = groups.get(k) ?? { count: 0, tokens: 0 };
  groups.set(k, { count: g.count + 1, tokens: g.tokens + a.tokens });
}
const total = agents.reduce((s, a) => s + a.tokens, 0);
const top = [...agents].sort((x, y) => y.tokens - x.tokens).slice(0, 10);
const out = [`file: ${file}`, "", `MAIN SESSION  turns: ${n(turns)}`];
out.push(...Object.entries(main).map(([k, v]) => `   ${k.padEnd(28)} ${n(v)}`));
out.push("", `SUBAGENTS  count: ${agents.length}  tokens: ${n(total)}`);
out.push("   by model:");
for (const [k, g] of [...groups].sort((a, b) => b[1].tokens - a[1].tokens)) {
  out.push(`   ${k.padEnd(34)} ${String(g.count).padStart(3)} ${n(g.tokens)}`);
}
out.push("   top 10 agents:");
for (const a of top)
  out.push(`   ${a.name.slice(0, 30).padEnd(30)} ${n(a.tokens)} ${a.model}`);
const REF =
  "cache reads are billed at a fraction of input tokens; they still scale with context size x turns";
out.push("", REF);
console.log(out.join("\n"));
