import { regionByCode, type RegionCode } from "../data/supportLines";

export const SUPPORT_REGION_KEY = "support_region";

const COUNTRY_TO_REGION: Record<string, RegionCode> = {
  IN: "IN",
  US: "US",
  GB: "UK",
  CA: "CA",
  AU: "AU",
  DE: "DE",
};

/** "en-GB" -> "UK"; null when the locale names no supported country. */
export function regionFromLocale(
  locale: string | undefined,
): RegionCode | null {
  const country = /[-_]([A-Za-z]{2})\b/.exec(locale ?? "")?.[1]?.toUpperCase();
  return (country && COUNTRY_TO_REGION[country]) || null;
}

/** True when the person picked a region, rather than it coming from the system. */
export function hasChosenSupportRegion(): boolean {
  try {
    return regionByCode(localStorage.getItem(SUPPORT_REGION_KEY)) !== null;
  } catch {
    return false;
  }
}

/** The region the person chose, else the one the system language suggests. */
export function getSupportRegion(): RegionCode | null {
  try {
    const saved = localStorage.getItem(SUPPORT_REGION_KEY);
    if (regionByCode(saved)) return saved as RegionCode;
  } catch {
    // Storage can be unavailable; fall through to the default.
  }
  const locales =
    typeof navigator === "undefined"
      ? []
      : [...(navigator.languages ?? []), navigator.language];
  for (const l of locales) {
    const r = regionFromLocale(l);
    if (r) return r;
  }
  return null;
}

export function setSupportRegion(code: RegionCode | null) {
  try {
    if (code) localStorage.setItem(SUPPORT_REGION_KEY, code);
    else localStorage.removeItem(SUPPORT_REGION_KEY);
  } catch {
    // Not remembered; the sheet still works for this session.
  }
}
