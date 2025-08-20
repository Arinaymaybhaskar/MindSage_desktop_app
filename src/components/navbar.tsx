import { useContext, useEffect, useState, useRef } from "react";
import {
  Search,
  // Bell,
  // CheckCheck,
  // Goal as GoalIcon,
  Rocket,
} from "lucide-react"; // Added Rocket
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ProfileDropdown } from "./profileDropdown";
// import { motion, AnimatePresence } from "framer-motion";
// import { formatTimeAgo } from "../utils/DateFormatter"; // Adjust path if necessary
// import EmptyState from "./EmptyState"; // Adjust path if necessary

interface Notification {
  id: number;
  user_id: number;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  type: string; // e.g., 'goal_completed', 'reminder'
}

const Header = () => {
  // const [notifications, setNotifications] = useState<Notification[]>([]);
  // const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const notificationsRef = useRef<HTMLDivElement>(null);

  // const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    // Mock data for demonstration
    const mockNotifications: Notification[] = [
      {
        id: 1,
        user_id: 1,
        title: "Goal Achieved!",
        body: "You've completed 'Read 12 books'.",
        created_at: new Date().toISOString(),
        read: false,
        type: "goal_completed",
      },
      {
        id: 2,
        user_id: 1,
        title: "New Feature",
        body: "Check out the new AI-powered insights.",
        created_at: new Date(Date.now() - 3600000).toISOString(),
        read: false,
        type: "announcement",
      },
      {
        id: 3,
        user_id: 1,
        title: "Weekly Summary",
        body: "Your weekly progress report is ready.",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        read: true,
        type: "report",
      },
    ];
    // setNotifications(mockNotifications);
  }, []);

  // Close dropdown when clicking outside
  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (
  //       notificationsRef.current &&
  //       !notificationsRef.current.contains(event.target as Node)
  //     ) {
  //       setIsNotificationsOpen(false);
  //     }
  //   };
  //   document.addEventListener("mousedown", handleClickOutside);
  //   return () => document.removeEventListener("mousedown", handleClickOutside);
  // }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    const params = new URLSearchParams(location.search);
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    navigate({ pathname: "/journals", search: params.toString() });
  };

  // const markAllAsRead = async () => {
  //   // Mock API call
  //   setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  // };

  // const getNotificationIcon = (type: string) => {
  //   if (type.includes("goal"))
  //     return <GoalIcon className="w-5 h-5 text-success" />;
  //   return <Bell className="w-5 h-5 text-info" />;
  // };

  return (
    <header className="flex bg-tertiary-light dark:bg-secondary-dark items-center justify-between  border-b border-border-light dark:border-border-dark px-6 h-20 sticky top-0 z-50">
      {/* Logo and Branding */}
      <Link to="/dashboard" className="flex items-center gap-3">
        <img
          src="/assets/iconDark.png"
          alt="MindSage Logo"
          className="w-8 h-8 dark:hidden"
        />
        <img
          src="/assets/iconLight.png"
          alt="MindSage Logo"
          className="w-8 h-8 hidden dark:block"
        />
        <h1 className="text-xl hidden md:block font-[fraunces]">
          <span className="font-bold text-gray-900 dark:text-white">Mind</span>
          <span className="text-gray-500 dark:text-gray-400">Sage</span>
        </h1>
      </Link>

      {/* Search and User Actions */}
      <div className="flex items-center gap-4">
        <Link
          to="/ollama-tutorial"
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-text-light-sub dark:text-text-dark-sub  rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
        >
          <Rocket size={16} />
          <span className="hidden lg:block">Get Started</span>
        </Link>
        <div className="relative w-64 lg:w-96">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={handleSearch}
            placeholder="Search journal entries..."
            className="pl-10 focus:outline-none pr-4 py-2 w-full bg-tertiary-light dark:bg-tertiary-dark text-gray-900 dark:text-gray-100 placeholder:text-text-dark dark:placeholder:text-text-dark-sub border border-border-light dark:border-border-dark rounded-lg text-sm transition"
          />
        </div>

        {/* --- NEW: Get Started with Ollama Button --- */}

        {/* <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" /> */}

        {/* Notifications */}
        {/* <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className="relative p-2 rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark text-text-light-sub dark:text-text-dark-sub transition-colors"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white dark:ring-gray-800/50" />
            )}
          </button>

          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute top-full right-0 mt-3 w-80 sm:w-96 bg-secondary-light dark:bg-secondary-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark origin-top-right z-10"
              >
                <div className="flex justify-between items-center p-4 border-b border-border-light dark:border-border-dark">
                  <h3 className="font-semibold text-text-light dark:text-text-dark">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-1.5 text-xs font-semibold text-text-light-sub dark:text-text-dark-sub hover:underline"
                    >
                      <CheckCheck size={14} /> Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-start gap-4 p-4 border-b border-gray-100 dark:border-gray-700/50 ${
                          !n.read
                            ? "bg-tertiary-light dark:bg-tertiary-dark"
                            : ""
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {getNotificationIcon(n.type)}
                        </div>
                        <div>
                          <p className="font-semibold  text-sm mb-1 text-text-light dark:text-text-dark">
                            {n.title}
                          </p>
                          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                            {n.body}
                          </p>
                          <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-1">
                            {formatTimeAgo(n.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4">
                      <EmptyState
                        Icon={Bell}
                        title="No Notifications"
                        message="You're all caught up!"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div> */}

        {/* <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" /> */}

        <ProfileDropdown />
      </div>
    </header>
  );
};

export default Header;
