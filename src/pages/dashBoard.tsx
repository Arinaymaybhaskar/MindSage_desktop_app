import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { userService } from "../api/userService";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  TrendingUp,
  Plus,
  Target,
  FileText,
  ArrowRight,
  UserIcon,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";
import RecentEntryCard from "../components/RecentEntryCard";
import MasonrySkeleton from "../components/Skeletons/MasonrySkeleton";
import DashboardSkeleton from "../components/Skeletons/DashBoardSkeleton";
import StatCard from "../components/StatCard";
import MoodSentimentChart from "../components/MoodSentimentChart";
import { dashboardService } from "../api/dashBoardService";
import journalService from "../api/journalService";

const Masonry = lazy(() => import("../components/masonry"));

interface User {
  username: string;
  email: string;
  created_at: string;
  full_name: string;
}

interface JournalEntry {
  id: number;
  title: string;
  content: string;
  created_at: string;
  mood_score: number;
  mood_tags: string | string[];
  image_key?: string;
}

interface PinnedGoal {
  id: number;
  title: string;
  current_value: number;
  target_value: number;
  unit: string;
}

interface ImageKeyEntry {
  id: number;
  title: string;
  image_key: string;
}

interface DashboardStats {
  totalEntries: number;
  totalWords: number;
  firstEntry: string | null;
  lastEntry: string | null;
  longestStreak: number;
  averageMood: number;
  totalGoals: number;
  completedGoals: number;
  activeGoals: number;
  mostUsedTag: string;
  averageEntriesPerDayOfWeek?: { day: string; average: number }[];
}

interface JournalingFrequency {
  day: string;
  entries: number;
}

function getTailwindColor(className: string) {
  const tempEl = document.createElement("div");
  tempEl.className = className;
  tempEl.style.display = "none";
  document.body.appendChild(tempEl);
  const color = getComputedStyle(tempEl).backgroundColor;
  document.body.removeChild(tempEl);
  return color;
}

const borderColor = getTailwindColor(
  "border-border-light dark:border-border-dark"
);
const infoColor = getTailwindColor("bg-light1 dark:bg-dark1");
const successColor = getTailwindColor("bg-success dark:bg-success");

const CustomLegend = ({ payload }) => {
  if (!payload) return null;
  return (
    <div className="flex flex-wrap w-full justify-center gap-3 px-6 pb-4">
      {payload.map((entry, index) => (
        <div key={`legend-${index}`} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          ></div>
          <span className="text-sm text-text-light dark:text-text-dark">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="p-3 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg shadow-lg">
      <p className="text-base font-semibold text-text-light dark:text-text-dark mb-1">
        {data.name}
      </p>
      <p className="text-sm text-text-light dark:text-text-dark">
        {data.value.toFixed(2)}
      </p>
    </div>
  );
};

const GoalStatusDonutChart = ({ data }) => {
  const COLORS = [infoColor, successColor];
  return (
    <div className="h-full w-full flex flex-col focus:outline-none">
      <h3 className="text-lg font-bold text-text-light dark:text-text-dark p-6 pb-2">
        Goal Status
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="40%"
            labelLine={false}
            outerRadius={60}
            fill="#8884d8"
            dataKey="value"
            stroke={borderColor}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const CustomTooltipBar = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="p-3 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg shadow-lg">
      <p className="text-base font-semibold text-text-light dark:text-text-dark mb-1">
        {data.payload.day}
      </p>
      <p className="text-sm text-text-light dark:text-text-dark">
        Entries: {data.value.toFixed(2)}
      </p>
    </div>
  );
};

const JournalingFrequencyBarChart = ({ data }) => {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Title matches the image */}
      <h3 className="text-xl font-bold text-text-light dark:text-text-dark p-6 pl-10 pb-2">
        Weekly Journaling Habits
      </h3>
      {/* Adjusted container height and chart margin for better spacing */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={"#444444"}
            vertical={false}
          />
          {/* Added styling to X-axis to match image (cleaner look) */}
          <XAxis
            dataKey="day"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          {/* Set fixed domain [0, 10] and added styling */}
          <YAxis
            // domain={[0, 10]}
            tickCount={6}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltipBar payload={data} active={true} />}
            cursor={{ fill: "rgba(156, 163, 175, 0.1)" }}
          />
          <Bar dataKey="entries" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={entry.entries > 5 ? successColor : infoColor}
              />
            ))}
            {/* DELETED: The <LabelList /> component was removed from here */}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function Dashboard() {
  const { accessToken, logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [pinnedGoals, setPinnedGoals] = useState<PinnedGoal[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [journalingFrequency, setJournalingFrequency] = useState<
    JournalingFrequency[] | null
  >(null);
  const [imageKeys, setImageKeys] = useState<ImageKeyEntry[]>([]);
  const [processedImages, setProcessedImages] = useState<any[]>([]);
  const navigate = useNavigate();
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isMasonryLoading, setIsMasonryLoading] = useState(true);
  const [profileImageSrc, setProfileImageSrc] = useState<string | null>(null);

  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    const fetchCoreData = async () => {
      if (!accessToken) {
        setIsDashboardLoading(false);
        return;
      }
      try {
        const dashboardData = await dashboardService.getData(
          authMode,
          accessToken
        );
        const imageData = await journalService.getImages(
          authMode,
          accessToken,
          "random"
        );
        const userData = await userService.getMe(authMode, accessToken);
        const statsData = await dashboardService.getStats(
          authMode,
          accessToken
        );

        console.log(statsData, "Stats Data");

        // Transform averageEntriesPerDayOfWeek -> day + entries
        const frequencyData =
          statsData.averageEntriesPerDayOfWeek?.map((item) => ({
            day: item.day.slice(0, 3),
            entries: item.average,
          })) || [];

        setJournalingFrequency(frequencyData);
        console.log(dashboardData, "dashBoard data");
        setUser(userData);
        setStats(statsData);
        setRecentEntries(dashboardData.recentJournals);
        setPinnedGoals(dashboardData.pinnedGoals);
        setImageKeys(imageData);
        setChartData(dashboardData.dailyScores);
      } catch (err) {
        console.error("Failed to fetch core dashboard data:", err);
        logout();
      } finally {
        setIsDashboardLoading(false);
      }
    };

    fetchCoreData();
  }, [accessToken, authMode, logout]);

  useEffect(() => {
    if (imageKeys.length === 0) {
      setIsMasonryLoading(false);
      return;
    }
    const processImages = async () => {
      try {
        const imgsWithSrc = await Promise.all(
          imageKeys.map(async (entry) => {
            const imageSrc = await window.electron.ipcRenderer.invoke(
              "media:getImage",
              entry.image_key.toString()
            );
            return { ...entry, image_key: imageSrc };
          })
        );
        setProcessedImages(imgsWithSrc);
      } catch (error) {
        console.error("Failed to process images:", error);
      } finally {
        setIsMasonryLoading(false);
      }
    };
    processImages();
  }, [imageKeys]);

  const goalChartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Active", value: stats.activeGoals },
      { name: "Completed", value: stats.completedGoals },
    ];
  }, [stats]);

  const loadProfileImage = async (imagePath?: string | null) => {
    if (!imagePath) {
      setProfileImageSrc(null);
      return;
    }
    try {
      const dataUrl = await window.electron.ipcRenderer.invoke(
        "media:getImage",
        imagePath
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
      const parsed = JSON.parse(userInfo);
      setUser(parsed);
      void loadProfileImage(parsed?.profile_picture ?? null);
    }
  }, []);

  const masonryItems = useMemo(() => {
    return processedImages.map((entry) => ({
      id: entry.id,
      title: entry.title,
      img: entry.image_key,
      url: `/journal/view/${entry.id}`,
      height: Math.floor(Math.random() * (500 - 250 + 1)) + 250,
    }));
  }, [processedImages]);

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

  const getProgressColors = (percentage: number) => {
    if (percentage >= 100) {
      return { bar: "bg-emerald-500", text: "text-emerald-500" };
    }
    if (percentage >= 70) {
      return { bar: "bg-green-500", text: "text-green-500" };
    }
    if (percentage >= 40) {
      return { bar: "bg-blue-500", text: "text-blue-500" };
    }
    // Default color for lower percentages
    return { bar: "bg-indigo-500", text: "text-indigo-500" };
  };

  const displayName = user?.full_name || user?.username;
  const displayInitial = displayName ? (
    displayName.charAt(0).toUpperCase()
  ) : (
    <UserIcon size={20} />
  );

  return (
    <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8 flex justify-between items-center">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-4xl font-[fraunces] font-semibold tracking-tight text-gray-900 dark:text-white">
                Welcome back, {user.full_name?.split(" ")[0] || user.username}
              </h1>
              <p className="text-lg text-text-light-sub dark:text-text-dark-sub mt-1">
                Here's a look at your recent activity and memories.
              </p>
            </div>
            <div>
              <Link
                to="/journal/new"
                className="flex w-[40%] items-center h-12 gap-2 px-5 py-2.5 bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark font-semibold rounded-lg shadow-md hover:bg-light1 dark:hover:bg-dark1 transition-all duration-200 hover:scale-101"
              >
                <Plus size={20} />
                <span>New Entry</span>
              </Link>
            </div>
          </div>
          <div>
            {profileImageSrc ? (
              <img
                src={profileImageSrc}
                alt="Avatar"
                className="w-80 h-80 object-cover rounded-full"
              />
            ) : (
              <span className="text-sm bg-tertiary-light dark:bg-tertiary-dark p-2">
                {displayInitial}
              </span>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={BookOpen}
            label="Total Entries"
            value={stats.totalEntries}
            color="indigo"
          />
          <StatCard
            icon={FileText}
            label="Total Words"
            value={stats.totalWords.toLocaleString()}
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            label="Longest streak"
            value={`${stats.longestStreak} days`}
            color="green"
          />
          <StatCard
            icon={Target}
            label="Goals Completed"
            value={stats.completedGoals}
            color="purple"
          />
        </section>

        {/* START: MODIFIED CHART SECTION */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left side: Main charts (3/4 width) */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/* Score Chart */}
            <div className="flex w-full h-full justify-center gap-6 items-center">
              <div className="flex-grow">
                {chartData && <MoodSentimentChart initialData={chartData} />}
              </div>
            </div>

            {/* Weekly Journaling Habit */}
            <div className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl">
              {journalingFrequency && (
                <JournalingFrequencyBarChart data={journalingFrequency} />
              )}
            </div>
          </div>

          {/* Right side: Goal Status and Pinned Goals (1/4 width) */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            {/* Goal Status */}
            <div className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl h-[30%]">
              <GoalStatusDonutChart data={goalChartData} />
            </div>

            {/* Pinned Goals */}
            <div className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl flex flex-col flex-grow min-h-[200px]">
              <div className="p-6 pb-4">
                <h3 className="text-lg font-bold text-text-light dark:text-text-dark">
                  Pinned Goals
                </h3>
              </div>

              {pinnedGoals.length > 0 ? (
                <div className="flex-grow space-y-1 overflow-y-auto no-scrollbar px-6 pb-6">
                  {[...pinnedGoals]
                    .sort(
                      (a, b) =>
                        b.current_value / b.target_value -
                        a.current_value / a.target_value
                    )
                    .map((goal) => {
                      const progressPercentage = Math.min(
                        100,
                        Math.round(
                          (goal.current_value / goal.target_value) * 100
                        )
                      );
                      const { bar: barColor, text: textColor } =
                        getProgressColors(progressPercentage);

                      return (
                        <button
                          onClick={() => navigate(`/goals/view/${goal.id}`)}
                          className="p-3 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors w-full cursor-pointer text-left"
                          key={goal.id}
                        >
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-medium text-text-light dark:text-text-dark truncate pr-2">
                              {goal.title}
                            </span>
                            <span className={`text-xs font-bold ${textColor}`}>
                              {progressPercentage}%
                            </span>
                          </div>
                          <div className="w-full bg-white dark:bg-base-dark rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${barColor} transition-all duration-500 ease-out`}
                              style={{ width: `${progressPercentage}%` }}
                            ></div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              ) : (
                <div className="flex-grow flex items-center justify-center text-text-light-sub dark:text-text-dark-sub">
                  <p>No goals pinned.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* END: MODIFIED CHART SECTION */}

        <section className="my-12">
          <div className="flex justify-between items-center mb-6 px-2">
            <h2 className="text-2xl font-bold text-text-light dark:text-text-dark">
              Recent Entries
            </h2>
            <Link
              to="/journals"
              className="flex items-center gap-1 text-sm font-semibold text-text-light-sub dark:text-text-dark-sub hover:text-dark1 transition-colors"
            >
              View all <ArrowRight size={16} />
            </Link>
          </div>
          {recentEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentEntries.map((entry) => (
                <RecentEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-secondary-light dark:bg-secondary-dark rounded-xl border border-dashed border-border-light dark:border-border-dark">
              <p className="text-text-light-sub dark:text-text-dark-sub">
                No recent entries found.
              </p>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-bold text-text-light dark:text-text-dark mb-6 px-2">
            Memories
          </h2>
          <div className="w-full min-h-[600px] ">
            {isMasonryLoading ? (
              <MasonrySkeleton />
            ) : (
              <Suspense fallback={<MasonrySkeleton />}>
                <Masonry
                  items={masonryItems}
                  ease="power3.out"
                  duration={0.6}
                  stagger={0.05}
                  animateFrom="bottom"
                />
              </Suspense>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
