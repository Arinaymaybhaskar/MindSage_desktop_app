/**
 * Incremental reader for JSON that is still arriving.
 *
 * The chat reply is generated with Ollama's `format: "json"`, so the token
 * stream spells out `{"response": "I hear ...` one fragment at a time. Showing
 * those tokens to the user verbatim would put braces, key names and escape
 * sequences in the chat, so the streamed text has to be pulled out of the
 * half-written document on every frame.
 *
 * Kept dependency-free and in its own file so it can be unit tested: it is
 * parsing adversarial input (arbitrary truncation points, including the middle
 * of a `\uXXXX` escape) and a mistake surfaces directly in the chat window.
 */

/** JSON's single-character escapes, minus \u which needs its own handling. */
const SIMPLE_ESCAPES = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

/**
 * Decodes the string value of `key` from a possibly-incomplete JSON document.
 *
 * @param {string} raw   The bytes received so far.
 * @param {string} key   The key whose string value should be read.
 * @returns {string|null} The decoded text - complete or partial - or null when
 *   the key has not arrived yet, or its value is not a string.
 *
 * Truncation is expected rather than exceptional: the buffer routinely ends
 * mid-escape, and stopping short of a partial escape avoids emitting a stray
 * backslash or half a code unit that would then have to be un-rendered.
 */
export function partialJsonString(raw, key) {
  const keyToken = `"${key}"`;
  const keyAt = raw.indexOf(keyToken);
  if (keyAt === -1) return null;

  let i = keyAt + keyToken.length;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== ":") return null;
  i++;
  while (i < raw.length && /\s/.test(raw[i])) i++;

  // Nothing yet, or a non-string value (null, a number) - nothing to show.
  if (i >= raw.length || raw[i] !== '"') return null;
  i++;

  let out = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') return out; // value closed
    if (ch !== "\\") {
      out += ch;
      i++;
      continue;
    }

    const esc = raw[i + 1];
    if (esc === undefined) return out; // truncated immediately after the backslash

    if (esc === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (hex.length < 4) return out; // truncated mid-codepoint
      const code = parseInt(hex, 16);
      if (Number.isNaN(code)) return out;
      out += String.fromCharCode(code);
      i += 6;
      continue;
    }

    out += SIMPLE_ESCAPES[esc] ?? esc;
    i += 2;
  }

  return out; // still open - a partial value
}

export default partialJsonString;
