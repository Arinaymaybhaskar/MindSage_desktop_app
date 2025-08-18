// src/components/settings/NotificationsSettings.tsx
import React from "react";
import { Save } from "lucide-react";
import { Switch } from "../ui/Switch";
import Select from "../ui/Select";

const NotificationsSettings = ({ settings, onSettingsSave }) => {
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
          Notifications & Reminders
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage how and when you receive notifications.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Journal Reminders
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Remind you to write in your journal.
            </p>
          </div>
          <Switch
            checked={localSettings?.journal_reminder}
            onCheckedChange={(v) => handleChange("journal_reminder", v)}
          />
        </div>
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Daily Challenge Alerts
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Notify about new journaling challenges.
            </p>
          </div>
          <Switch
            checked={localSettings?.challenge_alert}
            onCheckedChange={(v) => handleChange("challenge_alert", v)}
          />
        </div>
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Weekly Summary Email
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Receive a weekly summary of your progress.
            </p>
          </div>
          <Switch
            checked={localSettings?.weekly_summary_email}
            onCheckedChange={(v) => handleChange("weekly_summary_email", v)}
          />
        </div>
        <div className="flex justify-end border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
          >
            <Save size={16} /> Save Notification Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsSettings;
