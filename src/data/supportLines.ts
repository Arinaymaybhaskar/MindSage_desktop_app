// Crisis and support lines, bundled so the support sheet works offline
// (KAN-50/54). Safety-critical data: change a number only after checking the
// operator's own page, and update `VERIFIED_ON` with it.
//
// Last check: 2026-10-19, by web search of public pages that agree with each
// other (government and operator pages where the search reached them, news and
// council pages otherwise). It was NOT done against each operator's own site;
// treat a person re-checking these against the sources below as outstanding.
// 2026-10-20: iCall and Lifeline Australia hours checked on the operators'
// sites. `VERIFIED_ON` stays at the last full check; bump it only after every line is rechecked.

export type RegionCode = "IN" | "US" | "UK" | "CA" | "AU" | "DE";

export interface SupportLine {
  id: string;
  name: string;
  /** What to show for the voice number. Absent for text-only services. */
  voice?: string;
  /** Digits (and a leading +) for a tel: link. */
  voiceDial?: string;
  /** The number to text. Absent for voice-only lines, which never offer Text. */
  text?: string;
  hours: string;
  /** "under18" lines are for children and young people. */
  audience: "everyone" | "under18";
  note?: string;
  source: string;
}

export interface SupportRegion {
  code: RegionCode;
  name: string;
  /** Local number for an emergency, shown above the lines. */
  emergency: string;
  lines: SupportLine[];
}

export const VERIFIED_ON = "2026-10-19";

export const SUPPORT_REGIONS: SupportRegion[] = [
  {
    code: "IN",
    name: "India",
    emergency: "112",
    lines: [
      {
        id: "in-tele-manas",
        name: "Tele-MANAS",
        voice: "14416",
        voiceDial: "14416",
        hours: "24 hours, free",
        audience: "everyone",
        note: "Also 1-800-891-4416. Counsellors in many languages.",
        source: "telemanas.mohfw.gov.in",
      },
      {
        id: "in-icall",
        name: "iCall",
        voice: "+91 91529 87821",
        voiceDial: "+919152987821",
        hours: "Trained counsellors · Mon-Sat 8 AM-9 PM · also by email",
        audience: "everyone",
        source: "icallhelpline.org",
      },
      {
        id: "in-childline",
        name: "Childline",
        voice: "1098",
        voiceDial: "1098",
        hours: "24 hours, free",
        audience: "under18",
        source: "childlineindia.org",
      },
    ],
  },
  {
    code: "US",
    name: "United States",
    emergency: "911",
    lines: [
      {
        id: "us-988",
        name: "988 Suicide & Crisis Lifeline",
        voice: "988",
        voiceDial: "988",
        text: "988",
        hours: "24 hours, free",
        audience: "everyone",
        note: "For people of any age, including young people.",
        source: "988lifeline.org",
      },
    ],
  },
  {
    code: "UK",
    name: "United Kingdom",
    emergency: "999",
    lines: [
      {
        id: "uk-samaritans",
        name: "Samaritans",
        voice: "116 123",
        voiceDial: "116123",
        hours: "24 hours, free",
        audience: "everyone",
        source: "samaritans.org",
      },
      {
        id: "uk-shout",
        name: "Shout (text only)",
        text: "85258",
        hours: "24 hours, free",
        audience: "everyone",
        note: "Text SHOUT to 85258.",
        source: "giveusashout.org",
      },
      {
        id: "uk-childline",
        name: "Childline",
        voice: "0800 1111",
        voiceDial: "08001111",
        hours: "Free, will not show on a phone bill",
        audience: "under18",
        source: "childline.org.uk",
      },
    ],
  },
  {
    code: "CA",
    name: "Canada",
    emergency: "911",
    lines: [
      {
        id: "ca-988",
        name: "9-8-8 Suicide Crisis Helpline",
        voice: "988",
        voiceDial: "988",
        text: "988",
        hours: "24 hours, free, English and French",
        audience: "everyone",
        source: "canada.ca",
      },
      {
        id: "ca-kids-help-phone",
        name: "Kids Help Phone",
        voice: "1-800-668-6868",
        voiceDial: "18006686868",
        text: "686868",
        hours: "24 hours, free",
        audience: "under18",
        note: "Check kidshelpphone.ca for the word to text.",
        source: "kidshelpphone.ca",
      },
    ],
  },
  {
    code: "AU",
    name: "Australia",
    emergency: "000",
    lines: [
      {
        id: "au-lifeline",
        name: "Lifeline",
        voice: "13 11 14",
        voiceDial: "131114",
        text: "0477 13 11 14",
        hours: "24/7",
        audience: "everyone",
        source: "lifeline.org.au",
      },
      {
        id: "au-kids-helpline",
        name: "Kids Helpline",
        voice: "1800 55 1800",
        voiceDial: "1800551800",
        hours: "24 hours, free, ages 5 to 25",
        audience: "under18",
        source: "kidshelpline.com.au",
      },
    ],
  },
  {
    code: "DE",
    name: "Germany",
    emergency: "112",
    lines: [
      {
        id: "de-telefonseelsorge",
        name: "Telefonseelsorge",
        voice: "0800 111 0 111",
        voiceDial: "08001110111",
        hours: "24 hours, free, anonymous",
        audience: "everyone",
        note: "Also 0800 111 0 222.",
        source: "telefonseelsorge.de",
      },
      {
        id: "de-nummer-gegen-kummer",
        name: "Nummer gegen Kummer (Kinder- und Jugendtelefon)",
        voice: "116 111",
        voiceDial: "116111",
        hours: "Mon to Sat, 14:00 to 20:00, free",
        audience: "under18",
        source: "nummergegenkummer.de",
      },
    ],
  },
];

/** Shown when the region is not one of the above. */
export const INTERNATIONAL_HELP = {
  text: "Find a helpline in your country at findahelpline.com, or call your local emergency number if you are in danger.",
  url: "https://findahelpline.com",
};

export const regionByCode = (code: string | null | undefined) =>
  SUPPORT_REGIONS.find((r) => r.code === code) ?? null;
