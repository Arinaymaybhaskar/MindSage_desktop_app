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
  ArrowUpRightIcon,
  ArrowRight,
} from "lucide-react";

// Components
import RecentEntryCard from "../components/RecentEntryCard";
import MasonrySkeleton from "../components/Skeletons/MasonrySkeleton";
import DashboardSkeleton from "../components/Skeletons/DashBoardSkeleton";
import StatCard from "../components/StatCard";
import { goalService } from "../api/goalService";
import MoodSentimentChart from "../components/MoodSentimentChart";

// Dynamically import the Masonry component for code splitting
const Masonry = lazy(() => import("../components/masonry"));

// Interface Definitions
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

interface ImageKeyEntry {
  id: number;
  title: string;
  image_key: string;
}

export default function Dashboard() {
  const { accessToken, logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);
  const [pinnedGoals, setPinnedGoals] = useState<PinnedGoal[]>([]);
  const [chartData, setChartData] = useState();
  const [lastEntryId, setLastEntryId] = useState<number | null>(null);

  // State to hold just the image keys fetched initially
  const [imageKeys, setImageKeys] = useState<ImageKeyEntry[]>([]);
  // State for the fully processed images with data URIs
  const [processedImages, setProcessedImages] = useState<any[]>([]);

  // Separate loading states for the main dashboard and the masonry gallery
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [isMasonryLoading, setIsMasonryLoading] = useState(true);

  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  // EFFECT 1: Fetch core dashboard data (fast)
  useEffect(() => {
    const fetchCoreData = async () => {
      if (!accessToken) {
        setIsDashboardLoading(false);
        return;
      }
      try {
        // Fetch only the essential data first. Image keys are fetched but not processed.
        const [
          userData,
          recentEntriesData,
          imageData, // This now just gets the keys, which is fast
          pinnedGoalsData,
          chartData,
        ] = await Promise.all([
          userService.getMe(authMode, accessToken),
          journalService.getRecent(authMode, accessToken),
          journalService.getImages(authMode, accessToken, "random"),
          goalService.getPinned(authMode, accessToken),
          journalService.getChartData(authMode, accessToken, 30),
        ]);

        if (recentEntriesData && recentEntriesData.length > 0) {
          setLastEntryId(recentEntriesData[0].id);
        }

        setChartData(chartData);
        setUser(userData);
        console.log("User info set in localStorage from dashboard:", userData);
        localStorage.setItem("userInfo", JSON.stringify(userData));
        setPinnedGoals(pinnedGoalsData);
        setImageKeys(imageData); // Store the keys to be processed later

        const parsedEntries = recentEntriesData.map((entry) => ({
          ...entry,
          mood_tags: Array.isArray(entry.mood_tags) ? entry.mood_tags : [],
        }));
        setRecentEntries(parsedEntries);
      } catch (err) {
        console.error("Failed to fetch core dashboard data:", err);
        logout();
      } finally {
        // Render the main dashboard immediately
        setIsDashboardLoading(false);
      }
    };

    fetchCoreData();
  }, [accessToken, authMode, logout]);

  // EFFECT 2: Process images in the background (slower)
  useEffect(() => {
    if (imageKeys.length === 0) {
      setIsMasonryLoading(false); // No images to load
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
        // Once images are done, hide the masonry skeleton
        setIsMasonryLoading(false);
      }
    };

    processImages();
  }, [imageKeys]); // This effect runs only when imageKeys are fetched

  const getProgressColors = (
    percentage: number
  ): { bar: string; text: string } => {
    if (percentage >= 95) {
      return { bar: "bg-success", text: "text-success" };
    }
    if (percentage >= 50) {
      return { bar: "bg-info", text: "text-info" };
    }
    return { bar: "bg-warning", text: "text-warning" };
  };

  const masonryItems = useMemo(() => {
    // Depend on the new 'processedImages' state
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

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 text-xl">
        <p>Could not load user data.</p>
        <Link to="/login" className="mt-4 text-indigo-600 hover:underline">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-[fraunces] font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome back, {user.full_name?.split(" ")[0] || user.username}
          </h1>
          <p className="text-lg text-text-light-sub dark:text-text-dark-sub mt-1">
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
          <Link to={lastEntryId ? `/journal/view/${lastEntryId}` : "#"}>
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

        <div className="flex w-full h-full justify-center gap-6 items-center mt-6">
          {chartData && <MoodSentimentChart data={chartData} />}
          <section className="h-[500px] bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl w-1/4 flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-6 pb-4">
              <h3 className="text-lg font-bold text-text-light dark:text-text-dark">
                Goal Progress
              </h3>
              <Link
                to={"/goals"}
                className="text-text-light-sub dark:text-text-dark-sub p-1.5 rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                aria-label="View all goals"
              >
                <ArrowUpRightIcon size={18} />
              </Link>
            </div>

            {/* Scrollable Goal List */}
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
                    Math.round((goal.current_value / goal.target_value) * 100)
                  );
                  const { bar: barColor, text: textColor } =
                    getProgressColors(progressPercentage);

                  return (
                    <div
                      className="p-3 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
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
                      <div className="w-full bg-tertiary-dark dark:bg-base-dark rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${barColor} transition-all duration-500 ease-out`}
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
          {/* Section Header */}
          <div className="flex justify-between items-center mb-6 px-2">
            <h2 className="text-2xl font-bold text-text-light dark:text-text-dark">
              Recent Entries
            </h2>
            <Link
              to="/journals"
              className="flex items-center gap-1 text-sm font-semibold text-text-light-sub dark:text-text-dark-sub hover:text-info dark:hover:text-info transition-colors"
            >
              View all
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* Entries Grid or Empty State */}
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

        {/* Memories / Image Gallery */}
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
