import { describe, expect, it } from "vitest";
import { buildJournal } from "./journal.mjs";
import { buildQuestions, pickQuestions } from "./questions.mjs";

const NOW = new Date(2026, 9, 29, 15);
const j = buildJournal(NOW);
const qs = buildQuestions(j);
const A = j.entries.filter((e) => e.user === "A");

describe("demo journal", () => {
  it("is the same every time for the same day", () => {
    expect(buildJournal(NOW).entries).toEqual(j.entries);
  });

  it("has about 200 entries over 18 months, two profiles, some in Trash", () => {
    expect(A.length).toBeGreaterThan(180);
    expect(A.length).toBeLessThan(240);
    expect(j.users).toHaveLength(2);
    expect(A.some((e) => e.trashed)).toBe(true);
    expect(Math.max(...A.map((e) => e.offset))).toBeGreaterThan(500);
    expect(j.entries.some((e) => e.user === "B")).toBe(true);
  });

  it("uses moods 1 to 5, feeling words, and some entries with no mood", () => {
    const moods = new Set(A.map((e) => e.mood));
    expect([...moods].every((m) => m === null || (m >= 1 && m <= 5))).toBe(
      true,
    );
    expect(moods.has(null)).toBe(true);
    expect(A.filter((e) => e.feelings.length).length).toBeGreaterThan(150);
  });

  it("has goals with logs for both profiles, one completed, one trashed", () => {
    const goals = j.goals.filter((g) => g.user === "A");
    expect(goals.every((g) => g.logs.length > 0)).toBe(true);
    expect(goals.some((g) => g.completed)).toBe(true);
    expect(goals.some((g) => g.trashed)).toBe(true);
    expect(j.goals.some((g) => g.user === "B")).toBe(true);
  });

  it("keeps private words out of everything the questions may see", () => {
    const visible = j.live.map((e) => `${e.title} ${e.content}`).join(" ");
    for (const word of ["Kestrel", "Zephyr", "baritone", "Zanzibar", "Goa"])
      expect(visible).not.toContain(word);
  });

  it("keeps the facts of one question out of the filler", () => {
    const filler = j.live.filter((e) => !e.key);
    for (const word of ["Lisbon", "knee", "cello", "dentist", "wedding"])
      expect(filler.some((e) => e.content.includes(word))).toBe(false);
  });
});

describe("question set", () => {
  it("has 40 questions with unique ids", () => {
    expect(qs).toHaveLength(40);
    expect(new Set(qs.map((q) => q.id)).size).toBe(40);
  });

  it("covers every kind the ticket asks for", () => {
    const cats = new Set(qs.map((q) => q.cat));
    for (const c of [
      "meaning",
      "dates",
      "counts",
      "mood",
      "goals",
      "follow-ups",
      "unknown",
      "hostile",
      "private",
    ])
      expect(cats.has(c)).toBe(true);
  });

  it("only expects things the data can give", () => {
    for (const q of qs) {
      expect(q.q.length).toBeGreaterThan(5);
      for (const item of q.has ?? [])
        if (Array.isArray(item)) expect(item.length).toBeGreaterThan(0);
    }
  });

  it("makes the mood answers clear, not a coin toss", () => {
    const sat = j.live.filter(
      (e) => e.mood != null && new Date(`${e.day}T12:00:00`).getDay() === 6,
    );
    const rest = j.live.filter(
      (e) => e.mood != null && new Date(`${e.day}T12:00:00`).getDay() !== 6,
    );
    const avg = (xs) => xs.reduce((a, e) => a + e.mood, 0) / xs.length;
    expect(avg(sat)).toBeGreaterThan(avg(rest) + 0.3);
  });

  it("picks a subset by id, category or limit", () => {
    expect(pickQuestions(qs, "S01,dates").map((q) => q.id)).toEqual([
      "S01",
      "T01",
      "T02",
      "T03",
      "T04",
      "T05",
      "T06",
    ]);
    expect(pickQuestions(qs, undefined, "3")).toHaveLength(3);
  });
});
