import React, { useState, useEffect, useRef, useContext } from "react";
import AuthContext from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import {
  Settings,
  LogOut,
  ChevronDown,
  User as UserIcon,
  Bot,
} from "lucide-react";
import { ollamaService } from "../api/ollamaService";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

interface User {
  username: string;
  email: string;
  created_at: string;
  full_name: string | null;
  timezone: string;
}

// --- NEW: Reusable Custom Dropdown Component ---
const Dropdown = ({ options, selectedValue, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel =
    options.find((opt) => opt.value === selectedValue)?.label || placeholder;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 flex items-center justify-between text-left bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg focus:ring-2 focus:ring-info focus:border-info outline-none transition text-sm"
      >
        <span className="truncate text-text-light dark:text-text-dark">
          {selectedLabel}
        </span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown
            size={16}
            className="text-text-light-sub dark:text-text-dark-sub"
          />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 5 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full right-0 mt-1 w-full bg-surface-light dark:bg-surface-dark rounded-lg shadow-2xl border border-border-light dark:border-border-dark origin-top-right z-20 p-2 max-h-48 overflow-y-auto"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-left rounded-md text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ProfileDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const { logout } = useContext(AuthContext);
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  // All logic (useEffect, handlers) remains the same...
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const fetchedModels = await ollamaService.getModels(accessToken!);
        const modelNames = fetchedModels.map(
          (model: { name: string }) => model.name
        );
        setModels(modelNames);
        const storedModel = localStorage.getItem("selectedModel");
        if (storedModel && modelNames.includes(storedModel)) {
          setSelectedModel(storedModel);
        } else if (modelNames.length > 0) {
          setSelectedModel(modelNames[0]);
          localStorage.setItem("selectedModel", modelNames[0]);
        }
      } catch (error) {
        console.error("Error fetching models: ", error);
      }
    };
    fetchModels();
  }, [accessToken]);

  useEffect(() => {
    const userInfo = localStorage.getItem("userInfo");
    if (userInfo) {
      setUser(JSON.parse(userInfo));
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleModelChange = (model: string) => {
    localStorage.setItem("selectedModel", model);
    setSelectedModel(model);
    setIsOpen(false);
  };

  const handleLogout = () => {
    if (logout) logout();
    navigate("/login");
  };

  const displayName = user?.full_name || user?.username;
  const displayInitial = displayName ? (
    displayName.charAt(0).toUpperCase()
  ) : (
    <UserIcon size={20} />
  );

  const modelOptions = models.map((model) => ({ value: model, label: model }));

  return (
    <>
      <div className="relative " ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1.5 rounded-full transition-colors duration-200 border border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
        >
          {/* --- CHANGE: Themed avatar --- */}
          <div className="flex items-center justify-center w-8 h-8 bg-info/10 rounded-full text-info font-semibold">
            {displayInitial}
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
              className="absolute top-full right-0 mt-2 w-72 bg-secondary-light dark:bg-secondary-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark origin-top-right z-10"
            >
              <div className="p-4 border-b border-border-light dark:border-border-dark">
                <p className="font-semibold text-text-light dark:text-text-dark">
                  {displayName}
                </p>
                <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                  {user?.email}
                </p>
              </div>
              <div className="p-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-text-light-sub dark:text-text-dark-sub">
                  AI Model
                </div>
                {/* --- CHANGE: Replaced <select> with <Dropdown> --- */}
                <div className="px-2">
                  <Dropdown
                    options={modelOptions}
                    selectedValue={selectedModel}
                    onChange={handleModelChange}
                    placeholder={
                      models.length > 0 ? "Select a model" : "No models found"
                    }
                  />
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

      <AnimatePresence>
        {showLogoutModal && (
          // --- CHANGE: Themed Logout Modal ---
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
        )}
      </AnimatePresence>
    </>
  );
};
