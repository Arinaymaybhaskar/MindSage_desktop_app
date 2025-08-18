// src/components/settings/SecuritySettings.tsx
import React from "react";
import { Link } from "react-router-dom";
import { Switch } from "../ui/Switch";

const SecuritySettings = ({ settings, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = React.useState(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // This component might not need a save button if actions are immediate
  // or handled on other pages (like password change).

  return (
    <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Security & Privacy
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your account security and data privacy.
        </p>
      </div>
      <div className="p-6 divide-y divide-gray-200 dark:divide-gray-700">
        <div className="py-4 flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Biometric Lock
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Require biometrics to access the app.
            </p>
          </div>
          <Switch
            checked={localSettings?.biometric_lock}
            onCheckedChange={(v) =>
              onSettingsSave({ ...settings, biometric_lock: v })
            }
          />
        </div>
        <div className="py-4 flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Change Password
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Update your account password.
            </p>
          </div>
          <Link
            to="/change-password"
            className="text-sm font-semibold text-indigo-600 hover:underline"
          >
            Change
          </Link>
        </div>
        <div className="py-4 flex justify-between items-center">
          <div>
            <label className="font-medium text-red-600 dark:text-red-500">
              Delete Account
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Permanently delete your account and all data.
            </p>
          </div>
          <Link
            to="/delete-account"
            className="text-sm font-semibold text-red-600 hover:underline"
          >
            Delete
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
