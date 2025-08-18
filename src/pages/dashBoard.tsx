import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { formatTimeAgo } from "../utils/DateFormatter";
import { userService } from "../api/userService";
import journalService from "../api/journalService";
import { Link } from "react-router-dom";
import {
  BookOpen,
  TrendingUp,
  Edit,
  Pin,
  ArrowUpRightIcon,
} from "lucide-react";

// Import new components
import RecentEntryCard from "../components/RecentEntryCard";
import MasonrySkeleton from "../components/Skeletons/MasonrySkeleton";
import DashboardSkeleton from "../components/Skeletons/DashBoardSkeleton";
import StatCard from "../components/StatCard";
import { goalService } from "../api/goalService";
import MoodSentimentChart from "../components/MoodSentimentChart";

// Dynamically import the Masonry component for code splitting
const Masonry = lazy(() => import("../components/masonry"));

interface User {
  username: string;
  email: string;
  created_at: string;
  entriesCount: number;
  lastEntryDate: string;
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

export default function Dashboard() {
  const { accessToken, logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [pinnedGoals, setPinnedGoals] = useState<PinnedGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartData, setChartData] = useState();
  const [lastEntryId, setLastEntryId] = useState<number | null>(null);

  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        // Fetch all data concurrently for faster loading
        const [
          userData,
          recentEntriesData,
          imageData,
          pinnedGoalsData,
          chartData,
        ] = await Promise.all([
          userService.getMe(authMode, accessToken),
          journalService.getRecent(authMode, accessToken),
          journalService.getImages(authMode, accessToken, "random"),
          goalService.getPinned(authMode, accessToken),
          journalService.getChartData(authMode, accessToken, 30),
        ]);

        setLastEntryId(recentEntriesData[0].id);

        console.log(chartData, "ChartData");
        setChartData(chartData);
        setUser(userData);
        localStorage.setItem("userInfo", JSON.stringify(userData));
        setPinnedGoals(pinnedGoalsData);

        // Safely parse mood_tags for each entry
        const parsedEntries = recentEntriesData.map((entry) => ({
          ...entry,
          mood_tags: Array.isArray(entry.mood_tags) ? entry.mood_tags : [],
        }));
        setRecentEntries(parsedEntries);

        // Process images with their sources
        const imgsWithSrc = await Promise.all(
          imageData.map(async (entry) => {
            const imageSrc = await window.electron.ipcRenderer.invoke(
              "media:getImage",
              entry.image_key.toString()
            );
            return { ...entry, image_key: imageSrc };
          })
        );
        setImages(imgsWithSrc);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        logout(); // Logout on critical data fetch failure
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [accessToken, authMode, logout]);

  const masonryItems = useMemo(() => {
    return images.map((entry) => ({
      id: entry.id,
      title: entry.title,
      img: entry.image_key,
      url: `/journal/view/${entry.id}`,
      height: Math.floor(Math.random() * (500 - 250 + 1)) + 250,
    }));
  }, [images]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 text-xl bg-gray-100 dark:bg-slate-900">
        <p>Could not load user data.</p>
        <Link to="/login" className="mt-4 text-indigo-600 hover:underline">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 dark:bg-slate-900 min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome back, {user.full_name?.split(" ")[0] || user.username}
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 mt-1">
            Here's a look at your recent activity and memories.
          </p>
        </header>

        {/* Stats Section */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            icon={BookOpen}
            label="Entries this month"
            value={user.entriesCount}
            color="indigo"
          />
          <StatCard
            icon={TrendingUp}
            label="Current streak"
            value={`${0} days`} // Placeholder for streak
            color="green"
          />
          <Link to={`/journal/view/${lastEntryId}`}>
            <StatCard
              icon={Edit}
              label="Last entry"
              value={
                user.lastEntryDate ? formatTimeAgo(user.lastEntryDate) : "N/A"
              }
              color="purple"
            />
          </Link>
        </section>
        <div className="flex w-full h-full justify-center gap-6 items-center">
          {chartData && <MoodSentimentChart data={chartData} />}
          <section className="h-[500px] dark:bg-gray-800/50 border bg-white border-gray-200 dark:border-gray-700 rounded-xl p-6 pb-0 w-1/4 mt-6  shadow">
            <h3 className="text-xl flex font-bold w-full items-center mb-4 text-text-light dark:text-text-dark">
              Goal Progress{" "}
              <Link
                to={"/goals"}
                className="text-indigo-500 hover:text-white mb-2 rounded-full text-sm text-end ml-5 justify-end flex mt-2"
              >
                <ArrowUpRightIcon size={20} />
              </Link>
            </h3>
            <div className="space-y-4 overflow-y-scroll h-[423px] no-scrollbar ">
              {[...pinnedGoals] // create a shallow copy so we don't mutate original
                .sort(
                  (a, b) =>
                    b.current_value / b.target_value -
                    a.current_value / a.target_value
                )
                .map((goal) => {
                  const progressPercentage = Math.min(
                    100,
                    Math.round((goal.current_value / goal.target_value) * 100)
                  );
                  return (
                    <div className="pb-2" key={goal.id}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-text-light dark:text-text-dark">
                          {goal.title}
                        </span>
                        <span className="text-xs font-semibold text-indigo-500 ml-3 dark:text-indigo-400">
                          {progressPercentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500"
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>

        {/* Recent Entries Section */}
        <section className="my-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Recent Entries
            </h2>
            <Link
              to="/journals"
              className="text-sm font-semibold text-indigo-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {recentEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentEntries.map((entry) => (
                <RecentEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
              <p className="text-gray-500">No recent entries found.</p>
            </div>
          )}
        </section>

        {/* Memories / Image Gallery */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Memories
          </h2>
          <div className="w-full min-h-[600px] bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <Suspense fallback={<MasonrySkeleton />}>
              <Masonry
                items={masonryItems}
                ease="power3.out"
                duration={0.6}
                stagger={0.05}
                animateFrom="bottom"
                scaleOnHover={true}
                hoverScale={0.95}
              />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
