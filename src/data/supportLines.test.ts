import { describe, expect, it } from "vitest";
import { SUPPORT_REGIONS, VERIFIED_ON, regionByCode } from "./supportLines";
import { regionFromLocale } from "../utils/supportRegion";

describe("bundled support lines", () => {
  it("covers India, US, UK, Canada, Australia and Germany", () => {
    expect(SUPPORT_REGIONS.map((r) => r.code).sort()).toEqual(
      ["AU", "CA", "DE", "IN", "UK", "US"].sort(),
    );
  });

  it("gives every region an emergency number and at least one line", () => {
    for (const r of SUPPORT_REGIONS) {
      expect(r.emergency).toMatch(/^\d{2,3}$/);
      expect(r.lines.length).toBeGreaterThan(0);
    }
  });

  it("has an under-18 line wherever one is listed separately, and in most regions", () => {
    const withYoung = SUPPORT_REGIONS.filter((r) =>
      r.lines.some((l) => l.audience === "under18"),
    ).map((r) => r.code);
    expect(withYoung.sort()).toEqual(["AU", "CA", "DE", "IN", "UK"]);
  });

  it("Canada lists 9-8-8 for both calling and texting", () => {
    const ca = regionByCode("CA")!.lines.find((l) => l.id === "ca-988")!;
    expect(ca.voice).toBe("988");
    expect(ca.text).toBe("988");
  });

  it("every line can be reached somehow, with a dialable number for voice", () => {
    for (const r of SUPPORT_REGIONS)
      for (const l of r.lines) {
        expect(l.voice || l.text).toBeTruthy();
        if (l.voice) expect(l.voiceDial).toMatch(/^\+?\d+$/);
        expect(l.hours).toBeTruthy();
        expect(l.source).toBeTruthy();
      }
  });

  it("records when the numbers were checked", () => {
    expect(VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("regionFromLocale", () => {
  it("maps system locales to a region", () => {
    expect(regionFromLocale("en-GB")).toBe("UK");
    expect(regionFromLocale("en-IN")).toBe("IN");
    expect(regionFromLocale("de-DE")).toBe("DE");
    expect(regionFromLocale("fr-CA")).toBe("CA");
    expect(regionFromLocale("en_AU")).toBe("AU");
  });
  it("is null when there is no supported country", () => {
    expect(regionFromLocale("en")).toBeNull();
    expect(regionFromLocale("fr-FR")).toBeNull();
    expect(regionFromLocale(undefined)).toBeNull();
  });
});
