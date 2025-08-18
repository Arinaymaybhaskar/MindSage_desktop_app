import { useEffect, useState, lazy, Suspense } from "react";
import { useAuth } from "../hooks/useAuth";
import { userService } from "../api/userService";
import {
  User,
  Palette,
  BrainCircuit,
  Bell,
  Lock,
  Download,
  Mic,
  Target,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import SettingsSkeleton from "../components/Skeletons/SettingsSkeleton";

// Lazy load all the setting sections for better performance
const ProfileSettings = lazy(
  () => import("../components/settings/ProfileSettings")
);
const AppearanceSettings = lazy(
  () => import("../components/settings/AppearanceSettings")
);
const AISettings = lazy(() => import("../components/settings/AISettings"));
const NotificationsSettings = lazy(
  () => import("../components/settings/NotificationsSettings")
);
const AudioSettings = lazy(
  () => import("../components/settings/AudioSettings")
);
const GoalsSettings = lazy(
  () => import("../components/settings/GoalsSettings")
);
const SecuritySettings = lazy(
  () => import("../components/settings/SecuritySettings")
);
const ExportSettings = lazy(
  () => import("../components/settings/ExportSettings")
);

// Map all sections to their corresponding components
const settingsSections = {
  profile: { label: "Profile", icon: User, component: ProfileSettings },
  appearance: {
    label: "Appearance",
    icon: Palette,
    component: AppearanceSettings,
  },
  ai: { label: "AI Features", icon: BrainCircuit, component: AISettings },
  notifications: {
    label: "Notifications",
    icon: Bell,
    component: NotificationsSettings,
  },
  audio: { label: "Audio & Voice", icon: Mic, component: AudioSettings },
  goals: { label: "Goals & Streaks", icon: Target, component: GoalsSettings },
  security: { label: "Security", icon: Lock, component: SecuritySettings },
  export: { label: "Data Export", icon: Download, component: ExportSettings },
};

const Settings = () => {
  const [settings, setSettings] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [userResponse, settingsResponse] = await Promise.all([
          userService.getMe(authMode, accessToken),
          userService.getSettings(authMode, accessToken),
        ]);
        setUser(userResponse);
        setSettings(settingsResponse);
      } catch (error) {
        console.error("Failed to fetch settings data:", error);
        toast.error("Could not load your data.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [authMode, accessToken]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (settingsSections[hash]) {
        setActiveTab(hash);
      } else {
        setActiveTab("profile"); // Default to profile if hash is invalid
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange(); // Set initial tab based on current URL hash
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleSettingsSave = async (newSettings) => {
    const toastId = toast.loading("Saving settings...");
    try {
      const updatedSettings = await userService.updateSettings(
        authMode,
        accessToken,
        newSettings
      );
      setSettings(updatedSettings);
      toast.success("Settings saved!", { id: toastId });
    } catch (error) {
      toast.error("Failed to save settings.", { id: toastId });
    }
  };

  const handleProfileSave = async (newProfile) => {
    const toastId = toast.loading("Saving profile...");
    try {
      const updatedUser = await userService.updateProfile(
        authMode,
        accessToken,
        newProfile
      );
      setUser(updatedUser.user);
      localStorage.setItem("userInfo", JSON.stringify(updatedUser.user));
      toast.success("Profile updated!", { id: toastId });
    } catch (error) {
      toast.error("Failed to update profile.", { id: toastId });
    }
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  const ActiveComponent = settingsSections[activeTab]?.component;

  return (
    <>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "dark:bg-gray-700 dark:text-white",
        }}
      />
      <div className="bg-gray-100 dark:bg-slate-900 min-h-screen">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <header className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              Settings
            </h1>
            <p className="text-lg text-gray-500 dark:text-gray-400 mt-1">
              Manage your account and preferences.
            </p>
          </header>

          <div className="flex flex-col lg:flex-row gap-8 items-start">
            {/* Sidebar Navigation */}
            <aside className="lg:w-1/4 w-full sticky top-24">
              <nav className="space-y-1">
                {Object.entries(settingsSections).map(
                  ([key, { label, icon: Icon }]) => (
                    <a
                      key={key}
                      href={`#${key}`}
                      onClick={() => setActiveTab(key)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                        activeTab === key
                          ? "bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
                      }`}
                    >
                      <Icon size={20} />
                      <span>{label}</span>
                    </a>
                  )
                )}
              </nav>
            </aside>

            {/* Main Content Area */}
            <div className="lg:w-3/4 w-full">
              <Suspense
                fallback={
                  <div className="bg-white dark:bg-gray-800/50 p-6 rounded-2xl h-96 animate-pulse" />
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
