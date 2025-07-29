import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
  PenIcon,
  BookOpenIcon,
  TrophyIcon,
  SettingsIcon,
  LogOutIcon,
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
    if(authUser) {
      console.log(authUser, )
      setUser(authUser)
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
  ];

  const displayName = user?.full_name || user?.username;

  return (
    <>
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col relative z-10">
        <div className="p-6 border-b border-gray-100 h-[80px]">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            MindSage
          </h1>
          <p className="text-xs text-gray-500 mt-1">Your personal journal</p>
        </div>
        <nav className="mt-6 px-2 flex-1">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center w-full px-4 py-3 text-left rounded-lg transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 text-indigo-600 shadow-sm' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span
                      className={`mr-3 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto w-1 h-5 bg-indigo-500 rounded-full"></span>
                    )}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={() => setShowLogoutModal(true)}
                className="flex items-center w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-all duration-200"
              >
                <LogOutIcon className="w-5 h-5 mr-3" />
                Logout
              </button>
            </li>
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-medium">
              {displayName ? displayName.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">
                {displayName}
              </p>
              <p className="text-xs text-gray-500">Premium</p>
            </div>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-white/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-80 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">
              Are you sure you want to logout?
            </h2>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded hover:bg-red-600"
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
