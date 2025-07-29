import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";

interface User {
  username: string;
  email: string;
  created_at: string;
  entriesCount: number;
  lastEntryDate: string;
}

interface JournalEntry {
  id: number;
  title: string;
  content: string;
  created_at: string;
  mood_score: number;
  mood_tags: string[];
}

const moodMap: Record<number, { emoji: string; label: string }> = {
  0: { emoji: "😐", label: "Neutral" },
  1: { emoji: "😞", label: "Sad" },
  2: { emoji: "😰", label: "Anxious" },
  3: { emoji: "🙂", label: "Calm" },
  4: { emoji: "😊", label: "Happy" },
  5: { emoji: "😁", label: "Joyful" },
};

export default function Dashboard() {
  const { accessToken, logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [currentStreak, setCurrentStreak] = useState<number>(5); // Replace 5 with API data when available
  const [recentEntries, setRecentEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("userInfo", JSON.stringify(user));
    }
  }, [user]);

  useEffect(() => {
    if (!accessToken) return;

    const fetchUser = async () => {
      try {
        const res = await api.get("/users/me");
        setUser(res.data);
        if (res.data.currentStreak !== undefined)
          setCurrentStreak(res.data.currentStreak);
      } catch (err) {
        console.error("Failed to fetch user", err);
        logout();
      }
    };

    fetchUser();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    const fetchRecentEntries = async () => {
      try {
        const res = await api.get("/journals/recent");
        setRecentEntries(res.data);
      } catch (err) {
        console.error("Failed to fetch recent journal entries:", err);
      }
    };

    fetchRecentEntries();
  }, [accessToken]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto bg-white p-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome back, {user.username}
        </h1>
        <p className="text-gray-600 mt-1">Continue your journaling journey</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-indigo-100 text-indigo-600 p-2 rounded-full">
              📖
            </div>
            <div>
              <p className="text-sm text-gray-500">Entries this month</p>
              <p className="text-xl font-semibold">{user.entriesCount}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-green-100 text-green-600 p-2 rounded-full">
              📈
            </div>
            <div>
              <p className="text-sm text-gray-500">Current streak</p>
              <p className="text-xl font-semibold">{currentStreak} days</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
            <div className="bg-purple-100 text-purple-600 p-2 rounded-full">
              ✏️
            </div>
            <div>
              <p className="text-sm text-gray-500">Last entry</p>
              <p className="text-xl font-semibold">
                {user.lastEntryDate
                  ? new Date(user.lastEntryDate).toDateString() ===
                    new Date().toDateString()
                    ? "Today"
                    : new Date(user.lastEntryDate).toLocaleDateString()
                  : "No entries yet"}
              </p>
            </div>
          </div>
        </div>

        {/* <div className="mt-10 bg-white shadow-md rounded-xl p-6">
          <MoodChart />
        </div> */}

        {/* Recent Entries Section */}
        <div className="mt-10">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            Recent Entries
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentEntries.length > 0 ? (
              recentEntries.map((entry) => {
                const mood = moodMap[entry.mood_score] || {
                  emoji: "📝",
                  label: "Unknown",
                };
                return (
                  <div
                    key={entry.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                  >
                    <p className="text-sm text-gray-500 mb-1">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-800">
                        {entry.title}
                      </h3>
                      <span
                        className={`text-sm px-2 py-1 rounded-full ${
                          mood.label === "Happy"
                            ? "bg-yellow-100 text-yellow-700"
                            : mood.label === "Anxious"
                            ? "bg-red-100 text-red-700"
                            : mood.label === "Calm"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {mood.emoji} {mood.label}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-2 text-sm line-clamp-3">
                      {entry.content}
                    </p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {entry.mood_tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-3 text-center text-gray-500">
                No recent entries found.
              </div>
            )}
          </div>
          <div className="mt-4 text-right">
            <a
              href="/journals"
              className="text-indigo-600 hover:underline font-medium"
            >
              View all
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
