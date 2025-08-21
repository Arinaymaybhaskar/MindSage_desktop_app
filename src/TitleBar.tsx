import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Square, Maximize2, X, Rocket, Search } from "lucide-react";
import { ProfileDropdown } from "./components/profileDropdown"; // Ensure path is correct
import { Link, useLocation, useNavigate } from "react-router-dom";

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [user, setUser] = useState(null);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false); // State for search bar visibility
  const navigate = useNavigate();
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // --- Handlers and Effects ---
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    const params = new URLSearchParams(location.search);
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    // Navigate to journals page to show search results
    navigate({ pathname: "/journals", search: params.toString() });
  };

  // Auto-focus input when it opens
  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  // Close search on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close search on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Other effects and handlers remain the same...
  const userInfo = localStorage.getItem("userInfo");
  useEffect(() => {
    if (userInfo) {
      setUser(JSON.parse(userInfo));
    }
  }, [userInfo]);

  useEffect(() => {
    window.electron?.onWindowStateChange((isMaximized: boolean) => {
      setIsMaximized(isMaximized);
    });
  }, []);

  const handleMinimize = () => window.electron?.minimize();
  const handleMaximize = () => window.electron?.maximize();
  const handleClose = () => window.electron?.close();

  const iconDark = new URL("../assets/iconDark.png", import.meta.url).href;
  const iconLight = new URL("../assets/iconLight.png", import.meta.url).href;

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 h-16 bg-base-light/80 dark:bg-base-dark/80 backdrop-blur-lg border-b border-border-light dark:border-border-dark z-50 flex items-center justify-between"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center h-full px-4">
        <img
          src={iconDark}
          className="w-5 h-5 dark:hidden"
          alt="MindSage Logo"
        />
        <img
          src={iconLight}
          className="w-5 h-5 hidden dark:block"
          alt="MindSage Logo"
        />
        <div className="pl-3 font-semibold text-sm text-text-light-sub dark:text-text-dark-sub">
          MindSage
        </div>
      </div>

      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <Link
          to="/ollama-tutorial"
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-text-light-sub dark:text-text-dark-sub rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
        >
          <Rocket size={16} />
          <span className="hidden lg:block">Get Started</span>
        </Link>
        {user && (
          <div className="flex items-center justify-center h-full gap-2 mx-2">
            {/* --- Animated Search Bar --- */}
            <div
              ref={searchContainerRef}
              className="relative flex items-center"
            >
              <AnimatePresence>
                {isSearchOpen && (
                  <motion.div
                    key="search-input"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "16rem", opacity: 1 }} // lg:w-96 = 24rem
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="relative"
                  >
                    <Search className="w-5 h-5 text-text-light-sub dark:text-text-dark-sub absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={handleSearchChange}
                      placeholder="Search journal entries..."
                      className="pl-10 pr-4 py-2 w-full bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark placeholder:text-text-light-sub dark:placeholder:text-text-dark-sub border border-border-light dark:border-border-dark rounded-lg text-sm transition focus:outline-none "
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {!isSearchOpen && (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 text-text-light-sub dark:text-text-dark-sub rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                  aria-label="Open search"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
            </div>

            <ProfileDropdown />
          </div>
        )}

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="h-full w-12 flex justify-center items-center text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-12 flex justify-center items-center text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
          aria-label="Maximize"
        >
          {isMaximized ? <Square size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          onClick={handleClose}
          className="h-full w-12 flex justify-center items-center text-text-light dark:text-text-dark hover:bg-danger hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
    </motion.header>
  );
};

export default TitleBar;
