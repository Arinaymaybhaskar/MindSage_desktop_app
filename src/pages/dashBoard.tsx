import { useEffect, useState, useMemo } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAuth } from "../hooks/useAuth";
import { userService } from "../api/userService";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Plus,
  Target,
  FileText,
  ArrowRight,
  UserIcon,
  Flame,
  CalendarDays,
  Image as ImageIcon,
} from "lucide-react";
import { MindSageMark } from "../components/ui/MindSageMark";
import BentoCard, { TileLabel } from "../components/dashboard/BentoCard";
import MoodHeatmap from "../components/dashboard/MoodHeatmap";
import StreakRing from "../components/dashboard/StreakRing";
import MoodOrb from "../components/ui/MoodOrb";
import MiniDonut from "../components/dashboard/MiniDonut";
import LazyThumb from "../components/LazyThumb";
import {
  buildSummary,
  currentStreak,
  daysWrittenIn,
  type DayScore,
} from "../utils/dashboardInsights";
import DashboardSkeleton from "../components/Skeletons/DashboardSkeleton";
import { dashboardService } from "../api/dashBoardService";
import journalService, { type JournalEntry } from "../api/journalService";
import type { DashboardStats, JournalImageEntry } from "../types/Dashboard";
import type { UserInfo } from "../types/User";

dayjs.extend(relativeTime);

interface PinnedGoal {
  id: number;
  title: string;
  current_value: number;
  target_value: number;
  unit: string;
}

export default function Dashboard() {
  const { accessToken, logout } = useAuth();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [pinnedGoals, setPinnedGoals] = useState<PinnedGoal[]>([]);
  const [imageKeys, setImageKeys] = useState<JournalImageEntry[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isMasonryLoading, setIsMasonryLoading] = useState(true);
  const [profileImageSrc, setProfileImageSrc] = useState<string | null>(null);
  /** Every day the user has ever written, for the heatmap and the streak. */
  const [allTimeScores, setAllTimeScores] = useState<DayScore[]>([]);

  const authMode = (localStorage.getItem("authMode") || "offline") as
    "offline" | "online";

  useEffect(() => {
    const fetchCoreData = async () => {
      if (!accessToken) {
        setIsDashboardLoading(false);
        return;
      }
      try {
        const dashboardData = await dashboardService.getData(
          authMode,
          accessToken,
        );
        const imageData = await journalService.getImages(
          authMode,
          accessToken,
          "random",
        );
        const userData = await userService.getMe(authMode, accessToken);
        const statsData = await dashboardService.getStats(
          authMode,
          accessToken,
        );
        // Already exposed for the chart's "All Time" range; reused here so the
        // heatmap and streak need no new query.
        const allTime = await dashboardService.getAllTimeScore(
          authMode,
          accessToken,
        );

        console.log(statsData, "Stats Data");
        console.log(dashboardData, "dashBoard data");
        setUser(userData);
        setStats(statsData);
        setRecentEntries(dashboardData.recentJournals);
        setPinnedGoals(dashboardData.pinnedGoals);
        setImageKeys(imageData);
        setIsMasonryLoading(false);
        setAllTimeScores(Array.isArray(allTime) ? allTime : []);
      } catch (err) {
        console.error("Failed to fetch core dashboard data:", err);
        logout();
      } finally {
        setIsDashboardLoading(false);
      }
    };

    fetchCoreData();
  }, [accessToken, authMode, logout]);

  const loadProfileImage = async (imagePath?: string | null) => {
    if (!imagePath) {
      setProfileImageSrc(null);
      return;
    }
    try {
      const dataUrl = await window.electron.ipcRenderer.invoke<string | null>(
        "media:get-image",
        imagePath,
      );
      setProfileImageSrc(dataUrl ?? null);
    } catch (err) {
      console.error("Failed to load profile image:", err);
      setProfileImageSrc(null);
    }
  };

  useEffect(() => {
    const userInfo = localStorage.getItem("userInfo");
    if (userInfo) {
      const parsed = JSON.parse(userInfo) as UserInfo;
      setUser(parsed);
      void loadProfileImage(parsed?.profile_picture ?? null);
    }
  }, []);

  // Raw file paths, not data URLs: each tile fetches its own resized thumbnail
  // when it scrolls into view. Converting them all up front is what made this
  // section the slowest thing on the page.
  const masonryItems = useMemo(
    () =>
      imageKeys.map((entry) => ({
        id: entry.id,
        title: entry.title,
        img: String(entry.image_key),
        url: `/journal/view/${entry.id}`,
      })),
    [imageKeys],
  );

  // Derived from data already fetched - no extra query needed. These sit above
  // the early returns below: hooks must run in the same order on every render,
  // and `stats` is null until the fetch resolves.
  const streak = useMemo(() => currentStreak(allTimeScores), [allTimeScores]);
  const daysWritten30 = useMemo(
    () => daysWrittenIn(allTimeScores, 30),
    [allTimeScores],
  );
  const summary = useMemo(
    () =>
      stats
        ? buildSummary({
            totalEntries: stats.totalEntries,
            totalWords: stats.totalWords,
            firstEntry: stats.firstEntry,
            streak,
            daysWritten30,
          })
        : "",
    [stats, streak, daysWritten30],
  );

  if (isDashboardLoading) {
    return <DashboardSkeleton />;
  }

  if (!user || !stats) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-gray-500 text-xl">
        <p>Could not load user data.</p>
        <Link to="/login" className="mt-4 text-indigo-600 hover:underline">
          Go to Login
        </Link>
      </div>
    );
  }

  /** Progress bar colour by completion, shared by the pinned-goal rows. */
  const getProgressColor = (percentage: number) => {
    if (percentage >= 100)
      return { bar: "bg-emerald-500", text: "text-emerald-500" };
    if (percentage >= 70)
      return { bar: "bg-green-500", text: "text-green-500" };
    if (percentage >= 40) return { bar: "bg-blue-500", text: "text-blue-500" };
    return { bar: "bg-indigo-500", text: "text-indigo-500" };
  };

  const displayName = user?.full_name || user?.username;
  const displayInitial = displayName ? (
    displayName.charAt(0).toUpperCase()
  ) : (
    <UserIcon size={20} />
  );

  const avgMoodLevel = Math.max(
    1,
    Math.min(5, Math.round(stats.averageMood || 3)),
  );
  const wordsPerEntry = stats.totalEntries
    ? Math.round(stats.totalWords / stats.totalEntries)
    : 0;

  return (
    <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto">
      {/* pb-24 clears the floating dock (absolute bottom-4, ~64px tall);
          pb-32 was more room than the dock needs and pushed the grid over a
          screen on its own. */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        {/* Hero. The subtitle is assembled from the user's own numbers rather
            than describing the page back to them. */}
        <header className="mb-5 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl sm:text-[2.75rem] font-semibold leading-[1.1] tracking-tight text-text-light dark:text-text-dark">
              Welcome back, {user.full_name?.split(" ")[0] || user.username}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-text-light-sub dark:text-text-dark-sub">
              {summary}
            </p>
            <Link
              to="/journal/new"
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-dark1 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Plus size={17} />
              New entry
            </Link>
          </div>

          {profileImageSrc ? (
            <img
              src={profileImageSrc}
              alt="Avatar"
              className="h-20 w-20 flex-shrink-0 rounded-full object-cover ring-2 ring-border-light/50 dark:ring-border-dark/50"
            />
          ) : (
            <span className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-tertiary-light dark:bg-tertiary-dark font-display text-2xl font-semibold text-text-light-sub dark:text-text-dark-sub ring-2 ring-border-light/50 dark:ring-border-dark/50">
              {displayInitial}
            </span>
          )}
        </header>

        {/* Bento grid. Tiles differ in size on purpose: the heatmap is the
            picture of the year and earns the space; the counts are glanceable
            and do not. */}
        {/* One screen, no scrolling. Two panels were cut to get here, both
            because the heatmap already answers what they asked:

            - Score Chart (500px) plotted mood over time, which the heatmap
              shows in a fraction of the height and far more legibly.
            - Weekly Journaling Habits (402px) averaged entries per weekday;
              the heatmap's rows *are* weekdays, so a thin Sunday row says the
              same thing without a second chart.

            The goal donut moved into the Goals tile rather than owning a panel
            of its own, and Memories became a strip instead of a 600px
            masonry. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
          <BentoCard index={0} emphasis className="lg:col-span-8">
            <MoodHeatmap scores={allTimeScores} />
          </BentoCard>

          <BentoCard
            index={1}
            className="lg:col-span-4 flex flex-col"
            testId="stat-card-streak"
          >
            <TileLabel icon={Flame}>Streak</TileLabel>
            <div className="flex flex-1 items-center py-2">
              <StreakRing current={streak} longest={stats.longestStreak} />
            </div>
          </BentoCard>

          <BentoCard index={2} className="lg:col-span-3">
            <TileLabel icon={MindSageMark}>How you have felt</TileLabel>
            <div className="mt-1 flex items-center gap-1">
              <MoodOrb
                level={avgMoodLevel}
                size="sm"
                hideLabel
                className="scale-[0.5] -my-5 -ml-6 -mr-4"
              />
              <div className="min-w-0">
                <p className="font-display text-2xl font-semibold leading-none text-text-light dark:text-text-dark">
                  {(stats.averageMood || 0).toFixed(1)}
                  <span className="text-sm text-text-light-sub dark:text-text-dark-sub">
                    {" "}
                    / 5
                  </span>
                </p>
                <p className="mt-1 truncate text-xs text-text-light-sub dark:text-text-dark-sub">
                  Most often{" "}
                  <span className="text-text-light dark:text-text-dark">
                    {stats.mostUsedTag && stats.mostUsedTag !== "N/A"
                      ? stats.mostUsedTag
                      : "unlabelled"}
                  </span>
                </p>
              </div>
            </div>
          </BentoCard>

          <BentoCard
            index={3}
            className="lg:col-span-3"
            testId="stat-card-entries"
          >
            <TileLabel icon={BookOpen}>Entries</TileLabel>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-text-light dark:text-text-dark">
              {stats.totalEntries.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-text-light-sub dark:text-text-dark-sub">
              {daysWritten30} in the last 30 days
            </p>
          </BentoCard>

          <BentoCard
            index={4}
            className="lg:col-span-3"
            testId="stat-card-words"
          >
            <TileLabel icon={FileText}>Words</TileLabel>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-text-light dark:text-text-dark">
              {stats.totalWords.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-text-light-sub dark:text-text-dark-sub">
              ~{wordsPerEntry.toLocaleString()} per entry
            </p>
          </BentoCard>

          {/* The donut lives here now instead of in a panel of its own. */}
          <BentoCard
            index={5}
            className="lg:col-span-3"
            testId="stat-card-goals"
          >
            <TileLabel icon={Target}>Goals</TileLabel>
            <div className="mt-1 flex items-center gap-3">
              <MiniDonut
                completed={stats.completedGoals}
                total={stats.totalGoals}
              />
              <div className="min-w-0">
                <p className="font-display text-2xl font-semibold leading-none tabular-nums text-text-light dark:text-text-dark">
                  {stats.completedGoals}
                  <span className="text-sm text-text-light-sub dark:text-text-dark-sub">
                    {" "}
                    / {stats.totalGoals}
                  </span>
                </p>
                <p className="mt-1 text-xs text-text-light-sub dark:text-text-dark-sub">
                  {stats.activeGoals} still active
                </p>
              </div>
            </div>
          </BentoCard>

          {/* Recent entries */}
          <BentoCard index={6} className="lg:col-span-8">
            <div className="flex items-baseline justify-between">
              <TileLabel icon={BookOpen}>Recent entries</TileLabel>
              <Link
                to="/journals"
                className="flex items-center gap-1 text-xs font-medium text-text-light-sub dark:text-text-dark-sub hover:text-text-light dark:hover:text-text-dark transition-colors"
              >
                View all <ArrowRight size={13} />
              </Link>
            </div>
            {recentEntries.length > 0 ? (
              <div className="mt-3 flex flex-col divide-y divide-border-light/50 dark:divide-border-dark/50">
                {recentEntries.slice(0, 3).map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/journal/view/${entry.id}`}
                    className="group flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="truncate font-display text-[15px] text-text-light dark:text-text-dark group-hover:underline underline-offset-2">
                      {entry.title?.trim() || "Untitled entry"}
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-text-light-sub dark:text-text-dark-sub">
                      {dayjs(entry.created_at).fromNow()}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-text-light-sub dark:text-text-dark-sub">
                No entries yet.
              </p>
            )}
          </BentoCard>

          <BentoCard index={7} className="lg:col-span-4">
            <TileLabel icon={CalendarDays}>Pinned goals</TileLabel>
            <div className="mt-3 flex flex-col gap-2.5">
              {pinnedGoals.length > 0 ? (
                pinnedGoals.slice(0, 3).map((goal) => {
                  const pct = Math.min(
                    100,
                    Math.round(
                      ((goal.current_value || 0) / (goal.target_value || 1)) *
                        100,
                    ),
                  );
                  const { bar, text } = getProgressColor(pct);
                  return (
                    <div key={goal.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] text-text-light dark:text-text-dark">
                          {goal.title}
                        </span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${text}`}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full rounded-full bg-tertiary-light dark:bg-tertiary-dark">
                        <div
                          className={`h-1 rounded-full ${bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                  Pin a goal to keep it in view here.
                </p>
              )}
            </div>
          </BentoCard>

          {/* Memories, as a strip. The masonry was 600px tall on its own. */}
          <BentoCard
            index={8}
            className="lg:col-span-12"
            testId="memories-grid"
          >
            <div className="flex items-baseline justify-between">
              <TileLabel icon={ImageIcon}>Memories</TileLabel>
              <Link
                to="/memories"
                className="flex items-center gap-1 text-xs font-medium text-text-light-sub dark:text-text-dark-sub hover:text-text-light dark:hover:text-text-dark transition-colors"
              >
                View all <ArrowRight size={13} />
              </Link>
            </div>
            {isMasonryLoading ? (
              <div className="mt-3 flex gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 flex-1 animate-pulse rounded-lg bg-tertiary-light dark:bg-tertiary-dark"
                  />
                ))}
              </div>
            ) : masonryItems.length > 0 ? (
              <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
                {masonryItems.slice(0, 8).map((item) => (
                  <Link
                    key={item.id}
                    to={item.url}
                    title={item.title}
                    className="group relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg"
                  >
                    {/* Fetched only when the strip is actually on screen, and
                        as a resized JPEG rather than the original file. */}
                    <LazyThumb
                      imagePath={item.img}
                      alt={item.title || "Memory"}
                      maxWidth={320}
                      className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-white">
                      {item.title}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-text-light-sub dark:text-text-dark-sub">
                Entries with photos will show up here.
              </p>
            )}
          </BentoCard>
        </div>
      </main>
    </div>
  );
}
