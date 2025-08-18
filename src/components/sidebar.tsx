import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
  PenIcon,
  BookOpenIcon,
  TrophyIcon,
  SettingsIcon,
  LogOutIcon,
  MessageSquareDot,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import AuthContext from "../context/AuthContext";

interface User {
  username: string;
  email: string;
  created_at: string;
  full_name: string | null;
  timezone: string;
}

const Sidebar = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const auth = useContext(AuthContext);
  useEffect(() => {
    const authUser = auth?.user;
    if (authUser) {
      setUser(authUser);
      return;
    }
    const userInfo = localStorage.getItem("userInfo");
    if (userInfo) {
      setUser(JSON.parse(userInfo));
    }
  }, [localStorage.getItem("userInfo")]);

  const navigate = useNavigate();
  const location = useLocation();

  // Logout confirmation
  const confirmLogout = () => {
    auth?.logout();
    navigate("/login");
  };

  const navItems = [
    {
      path: "/",
      icon: HomeIcon,
      label: "Dashboard",
    },
    {
      path: "/journal/new",
      icon: PenIcon,
      label: "Write",
    },
    {
      path: "/journals",
      icon: BookOpenIcon,
      label: "Journals",
    },
    {
      path: "/daily-challenge",
      icon: TrophyIcon,
      label: "Daily Challenge",
    },
    {
      path: "/settings",
      icon: SettingsIcon,
      label: "Settings",
    },
    {
      path: "/chat",
      icon: MessageSquareDot,
      label: "Chat",
    },
    
  ];

  const displayName = user?.full_name || user?.username;

  return (
    <>
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-dark2 border-r border-gray-200 dark:border-dark3 flex flex-col relative z-10">
        {/* Header */}
        <div className="p-2 flex flex-col justify-center items-center border-b border-gray-100 dark:border-dark3 h-[80px]">
          <div className="flex justify-center items-center">
            <img
              src="../../assets/iconDark.png"
              alt=""
              className="w-8 h-8 mr-2 dark:hidden"
            />
            <img
              src="../../assets/iconLight.png"
              alt=""
              className="w-8 h-8 mr-2 hidden dark:block"
            />
            <h1 className="text-xl">
              <span className="font-bold text-dark1 dark:text-light4">
                Mind
              </span>
              <span className="text-dark3 dark:text-light2">Sage</span>
            </h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-2 flex-1">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-light1 text-dark1 dark:bg-dark4 dark:text-white shadow-sm"
                        : "text-dark3 hover:bg-light4 dark:text-light1 dark:hover:bg-dark1"
                    }`}
                  >
                    <span
                      className={`transition-transform duration-200 ${
                        isActive ? "scale-110" : ""
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto w-1 h-5 bg-dark1 dark:bg-white rounded-full"></span>
                    )}
                  </Link>
                </li>
              );
            })}
            {/* Logout Button */}
            <li>
              <button
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center w-full px-4 py-3 text-left text-dark3 hover:bg-light4 dark:text-light1 dark:hover:bg-dark1 rounded-lg transition-all duration-200"
              >
                <LogOutIcon className="w-5 h-5 mr-3" />
                Logout
              </button>
            </li>
          </ul>
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-dark3">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-light1 text-dark1 dark:bg-dark4 dark:text-white flex items-center justify-center font-medium">
              {displayName ? displayName.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-dark2 dark:text-white">
                {displayName}
              </p>
              <p className="text-xs text-dark3 dark:text-light1">Premium</p>
            </div>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark2 p-6 rounded-lg shadow-xl w-80 border border-gray-200 dark:border-dark3">
            <h2 className="text-lg font-semibold text-dark1 dark:text-white mb-4 text-center">
              Are you sure you want to logout?
            </h2>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-sm text-dark3 bg-light4 hover:bg-light2 dark:bg-dark3 dark:text-white dark:hover:bg-dark4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
