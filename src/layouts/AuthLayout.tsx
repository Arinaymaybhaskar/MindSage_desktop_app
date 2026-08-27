import { Cloud, WifiOff } from "lucide-react";
import { type ReactNode } from "react";
import { motion } from "framer-motion";

// Resolve assets at build time
const authIconDark = new URL("../../assets/iconDark.png", import.meta.url).href;
const authIconLight = new URL("../../assets/iconLight.png", import.meta.url)
  .href;

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  /** Replaces the default mode blurb under the title. */
  subtitle?: ReactNode;
  /** Omit both to hide the offline/cloud toggle on screens with no choice. */
  authMode?: string;
  setAuthMode?: (authMode: "offline" | "online") => void;
}

export function AuthLayout({
  children,
  title,
  subtitle,
  authMode,
  setAuthMode,
}: AuthLayoutProps) {
  const toggleOptions = [
    { id: "offline", label: "Offline", icon: WifiOff },
    { id: "online", label: "Cloud", icon: Cloud },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-base-light dark:bg-base-dark">
      {/* --- Themed decorative panel --- */}
      <div className="hidden w-1/2 md:flex bg-secondary-light dark:bg-secondary-dark p-8 flex-col justify-between">
        <div className="flex items-center gap-2 font-bold text-lg text-text-light font-display dark:text-text-dark">
          <img
            src={authIconLight}
            alt="MindSage Logo"
            className="w-8 h-8 hidden dark:block"
          />
          <img
            src={authIconDark}
            alt="MindSage Logo"
            className="w-8 h-8 dark:hidden"
          />
          <span className="flex">
            Mind<p className="font-medium">Sage</p>
          </span>
        </div>
        <div className="text-text-light dark:text-text-dark space-y-6 max-w-md">
          <h1 className="text-4xl font-bold font-display">
            Capture your thoughts, one day at a time.
          </h1>
          <p className="text-text-light-sub dark:text-text-dark-sub">
            Your personal space to reflect, grow, and document your journey
            through life.
          </p>
          <div className="flex gap-4 pt-2">
            <div className="h-1 w-12 bg-light1 dark:bg-dark1 rounded-full"></div>
            <div className="h-1 w-12 bg-success rounded-full"></div>
            <div className="h-1 w-12 bg-warning rounded-full"></div>
          </div>
        </div>
        <div className="text-text-light dark:text-text-dark-sub text-sm">
          © {new Date().getFullYear()} MindSage. All rights reserved.
        </div>
      </div>

      {/* --- Themed form panel --- */}
      <div className="w-full lg:w-1/2 md:w-1/2 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="flex lg:hidden md:hidden justify-center items-center gap-2 mb-8">
            <img src={authIconDark} alt="MindSage Logo" className="w-8 h-8" />
            <p className="text-2xl font-display text-text-light dark:text-text-dark font-medium">
              <span className="font-bold">Mind</span>Sage
            </p>
          </div>

          <div className=" bg-secondary-light dark:bg-secondary-dark p-8 rounded-2xl shadow-lg border border-border-light dark:border-border-dark">
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold text-text-light dark:text-text-dark">
                {title}
              </h2>
              <p className="mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                {subtitle ??
                  (authMode === "offline"
                    ? "Your data stays on this device, secure and private."
                    : "Your data is synced securely to the cloud.")}
              </p>
            </div>

            {/* --- REVAMPED: Auth Mode Toggle with Disabled State --- */}
            {setAuthMode && (
            <div className="flex justify-center mb-6">
              <div className="relative flex w-full p-1 bg-tertiary-light dark:bg-tertiary-dark rounded-full">
                {toggleOptions.map((opt) => (
                  <button
                    key={opt.id}
                    // Only allow onClick for the "offline" option
                    onClick={() => {
                      if (opt.id === "offline") {
                        setAuthMode("offline");
                      }
                    }}
                    // Disable the "online" button
                    disabled={opt.id === "online"}
                    className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-full z-10 transition-colors ${
                      // Ternary to handle styling for all states
                      opt.id === "online"
                        ? // Disabled state for "online"
                          "text-dark1 dark:text-light1 opacity-70 cursor-not-allowed"
                        : authMode === opt.id
                        ? // Active state for "offline"
                          "text-text-light dark:text-text-dark"
                        : // Inactive state for "offline"
                          "text-text-light-sub dark:text-text-dark-sub"
                    }`}
                  >
                    {/* The animated pill only shows for the active "offline" mode */}
                    {authMode === opt.id && opt.id === "offline" && (
                      <motion.div
                        layoutId="auth-mode-pill"
                        className="absolute inset-0 bg-surface-light dark:bg-surface-dark rounded-full shadow-md"
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative">
                      <opt.icon size={16} />
                    </span>
                    {/* Display "Coming Soon" for the "online" option */}
                    <span className="relative font-semibold">
                      {opt.id === "online" ? "Coming Soon" : opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
