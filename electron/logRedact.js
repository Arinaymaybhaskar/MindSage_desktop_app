// What may appear in a log line (KAN-170). The journal is private, so a log
// must be safe to paste into a bug report. Redaction is done here, in one
// place, and is a safety net, not a licence to log entry text: it keeps keys
// that are known to hold writing out of objects, drops anything that looks
// like a media or journal path, and shortens long strings. A short free-text
// string passed on its own cannot be recognised, so call sites that hold entry
// text must log ids and lengths, never the text.

const SENSITIVE_KEYS = new Set([
  "content",
  "title",
  "newtitle",
  "text",
  "body",
  "summary",
  "transcript",
  "prompt",
  "systemprompt",
  "message",
  "messages",
  "answer",
  "question",
  "query",
  "note",
  "notes",
  "description",
  "tags",
  "mood_tags",
  "raw",
  "response",
  "airesponse",
  "aires",
  "chatdata",
  "context",
  "sources",
  "quote",
  "quotes",
  "email",
  "username",
  "full_name",
  "fullname",
  "password",
  "old_password",
  "new_password",
  "password_hash",
  "token",
  "recoverykey",
  "recovery_key",
]);

export const MAX_STRING = 200;
const MAX_DEPTH = 4;
const MAX_ARRAY = 10;
const MAX_STACK_LINES = 8;

// A file name may hold spaces (and the writer's own words), so a media path
// is taken to run to the next quote or the end of the line: it can swallow a
// little of the message after it, which is the safe direction to be wrong.
const MEDIA_PATH =
  /(?:[A-Za-z]:)?[^\s"'`]*[\\/]media[\\/](?:journals|chats|profile|thumbnails)[^"'`\n]*/g;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replaces the folders of this computer with short tokens, drops media paths,
 * and shortens a long string to its length.
 * @param {string} text
 * @param {{ replacements?: Array<[string, string]> }} [options]
 */
export function redactString(text, { replacements = [] } = {}) {
  let out = String(text);
  out = out.replace(MEDIA_PATH, "<media path>");
  for (const [dir, token] of replacements) {
    if (!dir) continue;
    out = out.replace(new RegExp(escapeRegExp(dir), "gi"), token);
  }
  return out.length > MAX_STRING ? `[${out.length} chars]` : out;
}

const lengthOf = (value) =>
  typeof value === "string"
    ? `[redacted: ${value.length} chars]`
    : Array.isArray(value)
      ? `[redacted: ${value.length} items]`
      : "[redacted]";

/** A safe copy of any value: JSON-friendly, shallow, with writing removed. */
export function redact(value, options = {}, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value, options);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }
  if (value instanceof Error) {
    const stack = (value.stack ?? "")
      .split("\n")
      .slice(0, MAX_STACK_LINES)
      .join("\n");
    return {
      error: value.name,
      message: redactString(value.message, options),
      stack: stack.length > 2000 ? `[${stack.length} chars]` : stack,
    };
  }
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    return `[binary: ${value.byteLength} bytes]`;
  }
  if (depth >= MAX_DEPTH) return "[…]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY)
      .map((v) => redact(v, options, depth + 1, seen));
    if (value.length > MAX_ARRAY) {
      items.push(`[+${value.length - MAX_ARRAY} more]`);
    }
    return items;
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? lengthOf(v)
      : redact(v, options, depth + 1, seen);
  }
  return out;
}
