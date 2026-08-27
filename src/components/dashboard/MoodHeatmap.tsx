import React, { useMemo, useState } from "react";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A year of days, one square each, coloured by that day's average mood.
 *
 * Laid out as twelve month blocks rather than as one continuous ribbon of
 * weeks. The ribbon ran months into each other - a month could begin halfway
 * down a column and end halfway down another - so there was no way to see a
 * month as a thing, or that one has 30 days and the next 31. Here each month is
 * its own rectangle: days fill downward in columns of seven, and the next month
 * always starts a fresh block.
 *
 * The weekday gutter went with it. Filling sequentially means a row no longer
 * corresponds to a weekday, so labelling one would have been a lie.
 */

export interface DayScore {
  day: string; // YYYY-MM-DD
  avgMood: number | null;
}

interface MoodHeatmapProps {
  scores: DayScore[];
}

/** Mood 1-5 → colour, matching the mood calendar and the orb. */
const MOOD_CLASS = [
  "bg-danger",
  "bg-warning",
  "bg-light1 dark:bg-dark1",
  "bg-success/80",
  "bg-success",
];

const EMPTY_CLASS = "bg-tertiary-light dark:bg-tertiary-dark/60";

const moodClass = (score: number | null | undefined) => {
  if (score == null || score <= 0) return EMPTY_CLASS;
  return MOOD_CLASS[Math.max(1, Math.min(5, Math.round(score))) - 1];
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const MoodHeatmap: React.FC<MoodHeatmapProps> = ({ scores }) => {
  const [hovered, setHovered] = useState<{
    day: string;
    mood: number | null;
  } | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const s of scores) if (s?.day) map.set(s.day, s.avgMood ?? null);
    return map;
  }, [scores]);

  // Only offer years the user actually wrote in, plus the current one. A picker
  // full of empty years is just a way to get lost.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const s of scores) if (s?.day) set.add(Number(s.day.slice(0, 4)));
    set.add(dayjs().year());
    return [...set].sort((a, b) => b - a);
  }, [scores]);

  const [year, setYear] = useState(() => dayjs().year());
  const yearIndex = years.indexOf(year);

  const { months, written } = useMemo(() => {
    const today = dayjs();
    let count = 0;

    const built = MONTHS.map((label, monthIndex) => {
      const first = dayjs(new Date(year, monthIndex, 1));
      const cells = Array.from({ length: first.daysInMonth() }, (_, i) => {
        const date = first.add(i, "day");
        const iso = date.format("YYYY-MM-DD");
        const mood = byDay.get(iso) ?? null;
        if (mood != null && mood > 0) count++;
        return { iso, mood, future: date.isAfter(today, "day") };
      });
      return { label, cells };
    });

    return { months: built, written: count };
  }, [byDay, year]);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-text-light dark:text-text-dark">
            Your year in mood
          </h3>
          <p className="mt-0.5 text-xs text-text-light-sub dark:text-text-dark-sub">
            {written} {written === 1 ? "day" : "days"} written in {year}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          {/* Fixed width: the readout appearing as the cursor moves must not
              nudge the year control or change the card's size. */}
          <span className="hidden w-[150px] text-right text-xs tabular-nums text-text-light-sub dark:text-text-dark-sub sm:inline">
            {hovered
              ? hovered.mood != null && hovered.mood > 0
                ? `${dayjs(hovered.day).format("D MMM")} · mood ${hovered.mood.toFixed(1)}`
                : `${dayjs(hovered.day).format("D MMM")} · no entry`
              : ""}
          </span>

          <div className="flex items-center gap-0.5 rounded-lg border border-border-light dark:border-border-dark p-0.5">
            <button
              type="button"
              aria-label="Previous year"
              disabled={yearIndex >= years.length - 1}
              onClick={() => setYear(years[yearIndex + 1])}
              className="rounded p-1 text-text-light-sub dark:text-text-dark-sub transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[2.75rem] text-center text-xs font-medium tabular-nums text-text-light dark:text-text-dark">
              {year}
            </span>
            <button
              type="button"
              aria-label="Next year"
              disabled={yearIndex <= 0}
              onClick={() => setYear(years[yearIndex - 1])}
              className="rounded p-1 text-text-light-sub dark:text-text-dark-sub transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* A fixed 12-column grid, not a wrapping flex row: with flex-wrap the
          twelfth month dropped to a line of its own and left the card mostly
          empty. Never scrolls, so no scrollbar can appear under the cursor and
          change the card's height - which is what caused the jitter. */}
      <div className="grid grid-cols-6 gap-x-2 gap-y-3 lg:grid-cols-12">
        {months.map((month) => (
          <div key={month.label} className="flex flex-col gap-1">
            <span className="text-[9px] leading-none text-text-light-sub/70 dark:text-text-dark-sub/70">
              {month.label}
            </span>
            {/* Column-major: seven cells down, then the next column. A 31-day
                month is visibly one cell longer than a 30-day one. */}
            <div
              className="grid gap-[2px]"
              style={{
                gridTemplateRows: "repeat(7, 9px)",
                gridAutoFlow: "column",
                gridAutoColumns: "9px",
              }}
            >
              {month.cells.map((cell) => (
                <div
                  key={cell.iso}
                  onMouseEnter={() =>
                    !cell.future &&
                    setHovered({ day: cell.iso, mood: cell.mood })
                  }
                  onMouseLeave={() => setHovered(null)}
                  title={
                    cell.future
                      ? ""
                      : `${cell.iso}${
                          cell.mood
                            ? ` · mood ${cell.mood.toFixed(1)}`
                            : " · no entry"
                        }`
                  }
                  // A ring rather than a scale on hover: transforms on a 10px
                  // square made the whole block appear to twitch.
                  className={`h-[9px] w-[9px] rounded-[2px] ${
                    cell.future
                      ? "bg-transparent"
                      : `${moodClass(cell.mood)} hover:ring-1 hover:ring-text-light/40 dark:hover:ring-text-dark/40`
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-text-light-sub dark:text-text-dark-sub">
        <span className="mr-1">Rough</span>
        {MOOD_CLASS.map((c) => (
          <span key={c} className={`h-2.5 w-2.5 rounded-[2px] ${c}`} />
        ))}
        <span className="ml-1">Great</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${EMPTY_CLASS}`} />
          No entry
        </span>
      </div>
    </div>
  );
};

export default MoodHeatmap;
