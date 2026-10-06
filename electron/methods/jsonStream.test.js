import { describe, it, expect } from "vitest";
import { partialJsonString } from "./jsonStream.js";

/**
 * The chat reply is streamed out of a JSON document that is still being
 * written, so the decoder is fed the same payload truncated at every possible
 * offset. These cases are the ones that would show up in the chat window as
 * stray backslashes, key names, or half-written characters.
 */
describe("partialJsonString", () => {
  it("returns null before the key has arrived", () => {
    expect(partialJsonString("", "response")).toBeNull();
    expect(partialJsonString('{"resp', "response")).toBeNull();
    expect(partialJsonString('{"response"', "response")).toBeNull();
    expect(partialJsonString('{"response":', "response")).toBeNull();
  });

  it("returns an empty string once the value has opened", () => {
    expect(partialJsonString('{"response": "', "response")).toBe("");
  });

  it("reads a partial value while it is still open", () => {
    expect(partialJsonString('{"response": "I hear', "response")).toBe(
      "I hear",
    );
  });

  it("reads a completed value and stops at the closing quote", () => {
    const raw = '{"response": "All done.", "suggested_user_prompt": "Next?"}';
    expect(partialJsonString(raw, "response")).toBe("All done.");
    expect(partialJsonString(raw, "suggested_user_prompt")).toBe("Next?");
  });

  it("decodes escapes rather than showing them literally", () => {
    const raw = '{"response": "Line one\\nLine \\"two\\"\\tend"}';
    expect(partialJsonString(raw, "response")).toBe(
      'Line one\nLine "two"\tend',
    );
  });

  it("decodes unicode escapes", () => {
    expect(partialJsonString('{"response": "caf\\u00e9"}', "response")).toBe(
      "café",
    );
  });

  it("stops short of a truncated escape instead of leaking a backslash", () => {
    expect(partialJsonString('{"response": "a\\', "response")).toBe("a");
    expect(partialJsonString('{"response": "caf\\u00', "response")).toBe("caf");
    expect(partialJsonString('{"response": "caf\\u00e', "response")).toBe(
      "caf",
    );
  });

  it("tolerates whitespace around the colon", () => {
    expect(partialJsonString('{"response"   :   "hi"}', "response")).toBe("hi");
    expect(partialJsonString('{\n  "response": "hi"\n}', "response")).toBe(
      "hi",
    );
  });

  it("returns null for a non-string value", () => {
    expect(partialJsonString('{"response": null}', "response")).toBeNull();
    expect(partialJsonString('{"response": 42}', "response")).toBeNull();
  });

  it("grows monotonically as the document arrives", () => {
    const complete = '{"response": "Two \\"quoted\\" words.\\nDone", "x": 1}';
    let previous = "";

    for (let end = 0; end <= complete.length; end++) {
      const decoded = partialJsonString(complete.slice(0, end), "response");
      if (decoded === null) continue;
      // Every prefix must extend the last one. A decoder that ever shortened
      // would make already-rendered text disappear from the chat.
      expect(decoded.startsWith(previous)).toBe(true);
      previous = decoded;
    }

    expect(previous).toBe('Two "quoted" words.\nDone');
  });

  it("never emits a lone trailing backslash at any truncation point", () => {
    const complete = '{"response": "a\\\\b\\nc\\u00e9d"}';
    for (let end = 0; end <= complete.length; end++) {
      const decoded = partialJsonString(complete.slice(0, end), "response");
      if (decoded === null) continue;
      expect(decoded.endsWith("\\")).toBe(
        // A real, fully-decoded backslash is legitimate; a dangling escape
        // marker is not. The only valid trailing backslash comes from "\\\\".
        decoded === "a\\",
      );
    }
  });
});
