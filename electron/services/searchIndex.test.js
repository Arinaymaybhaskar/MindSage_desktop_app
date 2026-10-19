import { describe, expect, it } from "vitest";
import {
  INDEX_UNAVAILABLE,
  IndexUnavailableError,
  indexUnavailableResult,
  isIndexUnavailable,
} from "./searchIndex.js";

describe("index-unavailable helpers", () => {
  it("recognises its own error and nothing else", () => {
    expect(isIndexUnavailable(new IndexUnavailableError())).toBe(true);
    expect(isIndexUnavailable(new Error("boom"))).toBe(false);
    expect(isIndexUnavailable(null)).toBe(false);
  });

  it("answers IPC callers with a result they can tell apart", () => {
    expect(indexUnavailableResult()).toMatchObject({
      success: false,
      code: INDEX_UNAVAILABLE,
    });
  });
});
