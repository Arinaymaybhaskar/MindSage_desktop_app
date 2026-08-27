import { useState, useEffect } from "react";
import { Save } from "lucide-react";
// Assuming you have a custom Switch and Select component
import { Switch } from "../ui/Switch";
import Select from "../ui/Select";
import type { SettingsPanelProps, UserSettings } from "../../types/User";

type AISettingsProps = Pick<SettingsPanelProps, "settings" | "onSettingsSave">;

interface AppearanceDraft {
  dark_mode: boolean;
  font_size: string;
}

const AISettings = ({ settings, onSettingsSave }: AISettingsProps) => {
  const [localSettings, setLocalSettings] = useState<AppearanceDraft>({
    dark_mode: false,
    font_size: "medium",
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        dark_mode: Boolean(settings.dark_mode),
        font_size: settings.font_size || "medium",
      });
    }
  }, [settings]);

  const handleChange = <K extends keyof AppearanceDraft>(
    key: K,
    value: AppearanceDraft[K]
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (settings) onSettingsSave({ ...settings, ...localSettings } as UserSettings);
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-display text-xl font-bold text-gray-900 dark:text-white">
          Appearance
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Customize how the app looks and feels.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Dark Mode
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Reduce eye strain in low-light environments.
            </p>
          </div>
          <Switch
            checked={localSettings.dark_mode}
            onCheckedChange={(v) => handleChange("dark_mode", v)}
          />
        </div>
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Font Size
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Adjust the text size for readability.
            </p>
          </div>
          <Select
            id="font-size"
            value={localSettings.font_size}
            onChange={(v) => handleChange("font_size", v)}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
        </div>
        <div className="flex justify-end border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
          >
            <Save size={16} /> Save Appearance
          </button>
        </div>
      </div>
    </div>
  );
};

export default AISettings;
