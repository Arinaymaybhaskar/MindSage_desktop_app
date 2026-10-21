import { describe, expect, it } from "vitest";
import { filterByTimeRange, hasTimeRange } from "./timeFilter.js";

const at = (iso) => ({ payload: { created_at: iso, source_id: iso } });
const r = [
  at("2026-10-01T09:00:00Z"),
  at("2026-10-10T09:00:00Z"),
  at("2026-10-17T09:00:00Z"),
  { payload: { source_id: "nodate" } },
];
const ids = (list) => list.map((x) => x.payload.source_id);

describe("filterByTimeRange", () => {
  it("keeps only results inside the range", () => {
    const out = filterByTimeRange(r, {
      from: "2026-10-09T00:00:00Z",
      to: "2026-10-12T00:00:00Z",
    });
    expect(ids(out)).toEqual(["2026-10-10T09:00:00Z"]);
  });

  it("works with only a start or only an end", () => {
    expect(ids(filterByTimeRange(r, { from: "2026-10-09T00:00:00Z" }))).toEqual(
      ["2026-10-10T09:00:00Z", "2026-10-17T09:00:00Z"],
    );
    expect(ids(filterByTimeRange(r, { to: "2026-10-02T00:00:00Z" }))).toEqual([
      "2026-10-01T09:00:00Z",
    ]);
  });

  it("drops results with no date when there is a bound", () => {
    const out = filterByTimeRange(r, { from: "2026-01-01T00:00:00Z" });
    expect(ids(out)).not.toContain("nodate");
  });

  it("ignores unusable bounds and keeps everything", () => {
    expect(filterByTimeRange(r, { from: null, to: null })).toHaveLength(4);
    expect(filterByTimeRange(r, { from: "last week" })).toHaveLength(4);
    expect(filterByTimeRange(r, undefined)).toHaveLength(4);
  });

  it("the old call shape passed an object as the score threshold; a number comparison with it matches nothing", () => {
    // Documents the bug (KAN-342): `score >= {from,to}` is always false.
    expect(0.9 >= { from: "a", to: "b" }).toBe(false);
  });

  it("reports whether there is a usable bound", () => {
    expect(hasTimeRange({ from: "2026-10-01T00:00:00Z" })).toBe(true);
    expect(hasTimeRange({ from: null, to: "x" })).toBe(false);
    expect(hasTimeRange(null)).toBe(false);
  });
});
