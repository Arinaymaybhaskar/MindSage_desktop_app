import { describe, expect, it, vi } from "vitest";

vi.mock("../log.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { importStatuses, WAITING } = await import("./importBackfill.js");

const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
const entry = (createdAt, extra = {}) => ({
  createdAt,
  title: "",
  content: long,
  mood: null,
  tags: [],
  ...extra,
});

describe("importStatuses (KAN-80)", () => {
  it("marks only the newest entries for the backfill", () => {
    const entries = [
      entry("2020-01-01"),
      entry("2024-01-01"),
      entry("2022-01-01"),
    ];
    const [oldest, newest, middle] = importStatuses(entries, 2);
    expect(oldest).toBeNull();
    expect(newest.ai_metadata_status).toBe("failed");
    expect(newest.ai_metadata_error).toBe(WAITING);
    expect(middle.ai_summary_status).toBe("failed");
  });

  it("asks nothing the source already has, and skips a short summary", () => {
    const [full] = importStatuses([
      entry("2024-01-01", {
        title: "A walk",
        mood: 4,
        tags: ["Calm"],
        content: "Too short.",
      }),
    ]);
    expect(full).toEqual({
      ai_metadata_status: "completed",
      ai_metadata_error: null,
      ai_summary_status: "skipped",
      ai_summary_error: null,
    });
  });
});
