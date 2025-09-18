import { useState, useEffect } from "react";
import { Switch } from "../ui/Switch";

export const PathOnTitlebar = () => {
  const [localSettings, setLocalSettings] = useState({
    path_on_titlebar: false,
  });

  // Load saved path setting from localStorage or props
  useEffect(() => {
    const storedPathSetting = localStorage.getItem("path_on_titlebar");
    setLocalSettings({
      path_on_titlebar:
        storedPathSetting !== null
          ? JSON.parse(storedPathSetting)
          : settings?.path_on_titlebar || false,
    });
  }, []);

  const handleChange = (name, value) => {
    setLocalSettings((prev) => {
      const updated = { ...prev, [name]: value };

      // Persist path_on_titlebar to localStorage
      if (name === "path_on_titlebar") {
        localStorage.setItem(name, JSON.stringify(value));
      }

      return updated;
    });
  };

  return (
    <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
      <div>
        <label className="font-medium text-text-light dark:text-text-dark">
          Path on Titlebar
        </label>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Show the current path in the titlebar for easy navigation.
        </p>
      </div>
      <Switch
        checked={localSettings.path_on_titlebar}
        onCheckedChange={(v) => handleChange("path_on_titlebar", v)}
      />
    </div>
  );
};

const AppearanceSettings = ({ settings }) => {
  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Appearance
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Customize how the app looks and feels.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Path on Titlebar */}
        {PathOnTitlebar()}
      </div>
    </div>
  );
};

export default AppearanceSettings;
