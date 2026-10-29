import { describe, expect, it } from "vitest";
import { cachedProfileName } from "./chatutils";

describe("cachedProfileName", () => {
  it("uses the profile name when full_name is null", () => {
    const cache = JSON.stringify({ id: 1, username: "माया", full_name: null });
    expect(cachedProfileName(cache)).toBe("माया");
  });

  it("falls back to User with no cache or a broken one", () => {
    expect(cachedProfileName(null)).toBe("User");
    expect(cachedProfileName("{not json")).toBe("User");
  });
});
