// src/components/settings/GoalsSettings.tsx
import React from "react";
import { Save } from "lucide-react";
import { Switch } from "../ui/Switch";

const GoalsSettings = ({ settings, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = React.useState(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (name, value) => {
    setLocalSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSettingsSave(localSettings);
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Goals & Streaks
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your journaling goals and track your progress.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Track Journal Streaks
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track consecutive days of journaling.
            </p>
          </div>
          <Switch
            checked={localSettings?.journal_streaks}
            onCheckedChange={(v) => handleChange("journal_streaks", v)}
          />
        </div>
        <div>
          <label
            htmlFor="journaling_goal"
            className="font-medium text-gray-900 dark:text-gray-100"
          >
            Weekly Journaling Goal
          </label>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Set how many entries you aim to write per week.
          </p>
          <div className="flex items-center gap-4">
            <input
              id="journaling_goal"
              type="range"
              min="1"
              max="14"
              value={localSettings?.journaling_goal || 5}
              onChange={(e) =>
                handleChange("journaling_goal", parseInt(e.target.value))
              }
              className="w-full"
            />
            <span className="font-semibold text-indigo-600 dark:text-indigo-400 w-12 text-center">
              {localSettings?.journaling_goal}
            </span>
          </div>
        </div>
        <div className="flex justify-end border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
          >
            <Save size={16} /> Save Goal Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalsSettings;
