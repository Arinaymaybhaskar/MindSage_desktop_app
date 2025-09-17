import React, { useState, useEffect, useRef, useContext } from "react";
import AuthContext from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Settings, LogOut, ChevronDown, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface User {
  username: string;
  email: string;
  created_at: string;
  full_name: string | null;
  timezone: string;
}

export const ProfileDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileImageSrc, setProfileImageSrc] = useState<string | null>(null);
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();

  // close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // helper to load a profile image from disk via main process and set profileImageSrc
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

  // react to localStorage changes or a custom event so avatar updates after profile edit
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "userInfo") {
        const newVal = e.newValue ? JSON.parse(e.newValue) : null;
        setUser(newVal);
        void loadProfileImage(newVal?.profile_picture ?? null);
      }
    };
    const onUserUpdated = () => {
      const userInfo = localStorage.getItem("userInfo");
      const parsed = userInfo ? JSON.parse(userInfo) : null;
      setUser(parsed);
      void loadProfileImage(parsed?.profile_picture ?? null);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("user:updated", onUserUpdated as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "user:updated",
        onUserUpdated as EventListener
      );
    };
  }, []);

  const handleLogout = () => {
    if (logout) logout();
    navigate("/login");
    window.location.reload();
  };

  const displayName = user?.full_name || user?.username;
  const displayInitial = displayName ? (
    displayName.charAt(0).toUpperCase()
  ) : (
    <UserIcon size={20} />
  );

  return (
    <>
      <div className="relative " ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1.5 rounded-full transition-colors duration-200 border border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
        >
          {/* Avatar: show image if available, otherwise initials */}
          <div className="flex items-center justify-center w-8 h-8 bg-light1 dark:bg-dark1/10 rounded-full text-dark1 dark:text-light1 font-semibold overflow-hidden">
            {profileImageSrc ? (
              <img
                src={profileImageSrc}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-sm">{displayInitial}</span>
            )}
          </div>

          {/* --- CHANGE: Themed display name --- */}
          <span className="text-sm font-semibold text-text-light dark:text-text-dark hidden sm:block">
            {displayName}
          </span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronDown
              size={18}
              className="text-text-light-sub dark:text-text-dark-sub"
            />
          </motion.div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute top-full right-0 mt-2 bg-secondary-light dark:bg-secondary-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark origin-top-right z-10"
            >
              <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-border-light dark:bg-border-dark flex items-center justify-center">
                  {profileImageSrc ? (
                    <img
                      src={profileImageSrc}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-semibold text-text-light dark:text-text-dark">
                      {displayInitial}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-text-light dark:text-text-dark">
                    {displayName}
                  </p>
                  <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                    {user?.email}
                  </p>
                </div>
              </div>
              <hr className="border-border-light dark:border-border-dark my-1" />
              <div className="p-2 gap-1 flex flex-col">
                <Link
                  to="/settings"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center w-full px-3 py-2 text-sm text-left rounded-md text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                >
                  <Settings size={16} className="mr-3" />
                  Settings
                </Link>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowLogoutModal(true);
                  }}
                  className="flex items-center w-full px-3 py-2 text-sm text-left text-danger rounded-md hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                >
                  <LogOut size={16} className="mr-3" />
                  Logout
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showLogoutModal &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-base-dark/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl shadow-xl w-full max-w-sm border border-border-light dark:border-border-dark"
              >
                <h2 className="text-lg font-bold text-text-light dark:text-text-dark text-center">
                  Confirm Logout
                </h2>
                <p className="text-sm text-text-light-sub dark:text-text-dark-sub text-center mt-2 mb-6">
                  Are you sure you want to sign out of your account?
                </p>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => setShowLogoutModal(false)}
                    className="px-6 py-2 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-6 py-2 text-sm font-semibold text-white bg-danger hover:bg-danger/90 rounded-lg transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
