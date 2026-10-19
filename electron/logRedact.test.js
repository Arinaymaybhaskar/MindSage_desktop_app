import { describe, expect, it } from "vitest";
import { MAX_STRING, redact, redactString } from "./logRedact.js";

const PHRASE = "my-secret-journal-phrase-7f3a";

describe("redact", () => {
  it("keeps numbers, booleans and short strings", () => {
    expect(redact({ id: 4, ok: true, tag: "x" })).toEqual({
      id: 4,
      ok: true,
      tag: "x",
    });
  });

  it("removes the values of keys that hold writing, keeping only a length", () => {
    const out = redact({
      content: PHRASE,
      title: PHRASE,
      summary: PHRASE,
      prompt: PHRASE,
      aiRes: PHRASE,
      mood_tags: ["calm", PHRASE],
      chatId: 3,
    });
    expect(JSON.stringify(out)).not.toContain(PHRASE);
    expect(out.content).toBe(`[redacted: ${PHRASE.length} chars]`);
    expect(out.mood_tags).toBe("[redacted: 2 items]");
    expect(out.chatId).toBe(3);
  });

  it("matches keys in any case and at any depth", () => {
    const out = redact({
      a: { b: { Content: PHRASE, c: [{ TITLE: PHRASE }] } },
    });
    expect(JSON.stringify(out)).not.toContain(PHRASE);
  });

  it("drops credentials and contact details", () => {
    const out = redact({
      password: "hunter2",
      email: "a@b.com",
      token: "t0k3n",
    });
    expect(JSON.stringify(out)).not.toMatch(/hunter2|a@b\.com|t0k3n/);
  });

  it("replaces a long string with its length", () => {
    const long = "x".repeat(MAX_STRING + 1);
    expect(redact(long)).toBe(`[${MAX_STRING + 1} chars]`);
    expect(redactString("short")).toBe("short");
  });

  it("drops journal and media paths, on Windows and elsewhere", () => {
    expect(
      redactString(
        String.raw`failed C:\Users\a\AppData\Roaming\MindSage\media\journals\12\photo of ${PHRASE}.png`,
      ),
    ).not.toContain(PHRASE);
    expect(
      redactString("open /home/a/.config/MindSage/media/chats/3/4/x.pdf now"),
    ).toBe("open <media path>");
  });

  it("replaces this computer's folders with tokens", () => {
    const out = redactString("at /home/alice/app/main.js:3", {
      replacements: [["/home/alice", "<home>"]],
    });
    expect(out).toBe("at <home>/app/main.js:3");
  });

  it("describes an Error without leaking a path or a long message", () => {
    const err = new Error(`bad ${"y".repeat(300)}`);
    const out = redact(err);
    expect(out.error).toBe("Error");
    expect(out.message).toBe("[304 chars]");
    expect(out.stack.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("copes with circular objects, binary data and huge arrays", () => {
    const a = { name: "a" };
    a.self = a;
    expect(redact(a).self).toBe("[circular]");
    expect(redact(Buffer.from("abc"))).toBe("[binary: 3 bytes]");
    const big = redact(Array.from({ length: 50 }, (_, i) => i));
    expect(big).toHaveLength(11);
    expect(big.at(-1)).toBe("[+40 more]");
  });

  it("stops at a depth limit", () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(JSON.stringify(redact(deep))).toContain("[…]");
  });
});
