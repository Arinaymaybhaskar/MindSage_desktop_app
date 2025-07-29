import { useEffect, useState } from "react";
import { SearchIcon, BellIcon } from "lucide-react";
import api from "../api/axios";
import { useNavigate, useLocation } from "react-router-dom";

interface Notification {
  id: number;
  user_id: number;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  type: string;
}

const Header = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await api.get("/notifications");
        setNotifications(res.data);
      } catch (err) {
        console.error("Failed to load notifications", err);
      }
    };
    fetchNotifications();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    const params = new URLSearchParams();
    if (value) params.set("search", value);

    // If not already on journal list page, navigate there
    if (!location.pathname.startsWith("/journal")) {
      navigate({
        pathname: "/",
        search: params.toString(),
      });
    } else {
      // If already there, just update the URL
      navigate({
        pathname: location.pathname,
        search: params.toString(),
      });
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  return (
    <header className="flex items-center bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-50 h-[80px] justify-end">
      {/* Search */}
      <div className="relative w-full max-w-md flex items-center justify-end">
        <SearchIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={handleSearch}
          placeholder="Search entries..."
          className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Notification */}
      <div className="relative ml-4">
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="text-gray-500 hover:text-gray-700 relative"
        >
          <BellIcon className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 shadow-lg rounded-md z-50 max-h-96 overflow-y-auto">
            <div className="p-3 font-semibold text-gray-700 border-b flex justify-between items-center">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {notifications.filter((n) => !n.read).length === 0 ? (
              <div className="p-4 text-gray-500 text-sm">
                No unread notifications
              </div>
            ) : (
              notifications
                .filter((n) => !n.read)
                .map((n) => (
                  <div
                    key={n.id}
                    className="p-3 hover:bg-gray-50 border-b cursor-pointer"
                    onClick={() => markAsRead(n.id)}
                  >
                    <div className="text-sm font-semibold">{n.title}</div>
                    <div className="text-sm text-gray-600">{n.body}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
