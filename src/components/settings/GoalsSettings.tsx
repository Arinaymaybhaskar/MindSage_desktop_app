// src/components/settings/GoalsSettings.tsx
import React, { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Switch } from "../ui/Switch";

const GoalsSettings = ({ settings, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (name, value) => {
    setLocalSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSettingsSave(localSettings);
  };

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Goals & Streaks
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Manage your journaling goals and track your progress.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Track Journal Streaks Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Track Journal Streaks
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Track consecutive days of journaling.
            </p>
          </div>
          <Switch
            checked={localSettings?.journal_streaks}
            onCheckedChange={(v) => handleChange("journal_streaks", v)}
          />
        </div>

        {/* Weekly Journaling Goal Setting */}
        <div className="p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <label
            htmlFor="journaling_goal"
            className="font-medium text-text-light dark:text-text-dark"
          >
            Weekly Journaling Goal
          </label>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-3">
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
              className="w-full h-2 bg-secondary-light dark:bg-secondary-dark rounded-lg appearance-none cursor-pointer slider-thumb"
              style={
                { "--thumb-color": "var(--color-info)" } as React.CSSProperties
              }
            />
            <span className="font-semibold text-info w-12 text-center">
              {localSettings?.journaling_goal}
            </span>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border-light dark:border-border-dark pt-6 mt-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all"
          >
            <Save size={16} /> Save Goal Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalsSettings;
