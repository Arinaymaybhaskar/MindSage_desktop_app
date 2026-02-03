import { useEffect, useState, lazy, Suspense } from "react";
import { useAuth } from "../hooks/useAuth";
import { userService } from "../api/userService";
import { User, Palette, Lock, Download, Boxes, MonitorCog } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import SettingsSkeleton from "../components/Skeletons/SettingsSkeleton";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { useToast } from "../context/ToastContext";

// Lazy-loaded settings components
const ProfileSettings = lazy(
  () => import("../components/settings/ProfileSettings")
);
const ColorSettings = lazy(
  () => import("../components/settings/ColorSettings")
);
const ModelSettings = lazy(
  () => import("../components/settings/ModelSettings")
);
const SecuritySettings = lazy(
  () => import("../components/settings/SecuritySettings")
);
const ExportSettings = lazy(
  () => import("../components/settings/ExportSettings")
);
const AppearanceSettings = lazy(
  () => import("../components/settings/AppearanceSettings")
);

// Mapping of sections
const settingsSections = {
  profile: { label: "Profile", icon: User, component: ProfileSettings },
  colors: { label: "Colors", icon: Palette, component: ColorSettings },
  appearance: {
    label: "Appearance",
    icon: MonitorCog,
    component: AppearanceSettings,
  },
  models: { label: "Models", icon: Boxes, component: ModelSettings },
  security: { label: "Security", icon: Lock, component: SecuritySettings },
  export: { label: "Data Export", icon: Download, component: ExportSettings },
};

const Settings = () => {
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const location = useLocation();
  const { showToast } = useToast();
  // Determine active tab from current URL
  const getActiveTabFromPath = () => {
    const parts = location.pathname.split("/").filter(Boolean); // e.g., ["settings", "models"]
    const key = parts.length > 1 ? parts[1] : "profile";
    return settingsSections[key] ? key : "profile";
  };

  const [activeTab, setActiveTab] = useState(getActiveTabFromPath());

  useEffect(() => {
    setActiveTab(getActiveTabFromPath());
  }, [location.pathname]);

  // Fetch user and settings on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [userResponse, settingsResponse] = await Promise.all([
          userService.getMe(authMode, accessToken!),
          userService.getSettings(authMode, accessToken!),
        ]);
        setUser(userResponse);
        setSettings(settingsResponse);
      } catch (error) {
        console.error("Failed to fetch settings data:", error);
        showToast("Could not load your data.", "danger");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [authMode, accessToken]);

  // Save handlers
  const handleProfileSave = async (newProfile) => {
    try {
      showToast("Saving profile...", "info");
      const updatedUser = await userService.updateProfile(
        authMode,
        accessToken!,
        newProfile
      );
      setUser(updatedUser.user);
      localStorage.setItem("userInfo", JSON.stringify(updatedUser.user));
      showToast("Profile updated!", "success");
    } catch (error) {
      showToast("Failed to update profile.", "danger");
    }
  };

  const handleSettingsSave = async (newSettings) => {
    showToast("Saving settings...", "info");
    try {
      const updatedSettings = await userService.updateSettings(
        authMode,
        accessToken!,
        newSettings
      );
      setSettings(updatedSettings);
      showToast("Settings saved!", "success");
    } catch (error) {
      showToast("Failed to save settings.", "danger");
    }
  };

  if (isLoading) return <SettingsSkeleton />;

  const ActiveComponent = settingsSections[activeTab]?.component;

  return (
    <>
      <div className="bg-base-light dark:bg-base-dark min-h-screen">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <header className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-text-light dark:text-text-dark">
              Settings
            </h1>
            <p className="text-lg text-text-light-sub dark:text-text-dark-sub mt-1">
              Manage your account and preferences.
            </p>
          </header>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
            {/* Sidebar */}
            <aside className="lg:w-1/4 w-full lg:sticky top-24">
              <nav className="space-y-1 relative">
                {Object.entries(settingsSections).map(
                  ([key, { label, icon: Icon }]) => (
                    <Link
                      key={key}
                      to={`/settings/${key}`}
                      className={`relative flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors z-10 ${
                        activeTab === key
                          ? "text-dark1 dark:text-light1"
                          : "text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                      }`}
                    >
                      {activeTab === key && (
                        <motion.div
                          layoutId="active-settings-pill"
                          className="absolute inset-0 bg-tertiary-light dark:bg-tertiary-dark rounded-lg z-0"
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                          }}
                        />
                      )}
                      <span className="relative z-10">
                        <Icon size={20} />
                      </span>
                      <span className="relative z-10">{label}</span>
                    </Link>
                  )
                )}
              </nav>
            </aside>

            {/* Content */}
            <div className="lg:w-3/4 w-full">
              <Suspense
                fallback={
                  <div className="bg-secondary-light dark:bg-secondary-dark p-6 rounded-2xl h-96 animate-pulse border border-border-light dark:border-border-dark" />
                }
              >
                {ActiveComponent && (
                  <ActiveComponent
                    user={user}
                    settings={settings}
                    onProfileSave={handleProfileSave}
                    onSettingsSave={handleSettingsSave}
                  />
                )}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Settings;
