import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Switch } from "../ui/Switch";

const NotificationsSettings = ({ settings, onSettingsSave }) => {
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
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
          Notifications & Reminders
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Manage how and when you receive notifications.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {/* Journal Reminders Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Journal Reminders
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Remind you to write in your journal.
            </p>
          </div>
          <Switch
            checked={localSettings?.journal_reminder}
            onCheckedChange={(v) => handleChange("journal_reminder", v)}
          />
        </div>

        {/* Weekly Summary Email Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Weekly Summary Email
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Receive a weekly summary of your progress.
            </p>
          </div>
          <Switch
            checked={localSettings?.weekly_summary_email}
            onCheckedChange={(v) => handleChange("weekly_summary_email", v)}
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border-light dark:border-border-dark pt-6 mt-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1/90 transition-all"
          >
            <Save size={16} /> Save Notification Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsSettings;
