// UserPromptSubmit: warn the model when the session context is large.
// A hook can warn, not stop a session. Fails OPEN: any error is exit 0, no output.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { readStdinJson } from "./lib.mjs";

const SOFT = 150000;
const HARD = 250000;
const TAIL_BYTES = 256 * 1024;

// Context size of the last assistant record in the file tail, or null.
// shortcut: a last record larger than TAIL_BYTES is not found (no warning); raise TAIL_BYTES if that bites.
function lastContextTokens(file) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString("utf8").split("\n");
    if (size > len) lines.shift(); // partial first line
    for (let i = lines.length - 1; i >= 0; i--) {
      let rec;
      try {
        rec = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const u = rec?.type === "assistant" && rec.message?.usage;
      if (!u) continue;
      const n =
        (u.input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.cache_read_input_tokens || 0);
      if (n > 0) return n;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

try {
  const input = await readStdinJson();
  const file = input?.transcript_path;
  if (typeof file === "string" && file) {
    const n = lastContextTokens(file);
    if (n !== null && n >= SOFT) {
      const k = Math.round(n / 1000);
      const lead =
        n >= HARD
          ? `Context is far over the safe size (~${k}k tokens). Stop new work. `
          : "";
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: `${lead}Context is ~${n} tokens. Tell the owner in ONE line to start a new session. Write docs/HANDOFF.md now (state, next steps, open decisions) and give the owner the first prompt for it.`,
          },
        }),
      );
    }
  }
} catch {
  // fail open
}
process.exit(0);
