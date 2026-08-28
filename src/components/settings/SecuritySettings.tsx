import type React from "react";
import { Link } from "react-router-dom";
import type { SettingsPanelProps } from "../../types/User";

type SecuritySettingsProps = Pick<
  SettingsPanelProps,
  "settings" | "onSettingsSave"
>;

// The only consumers of `settings`/`onSettingsSave` are the commented-out
// biometric-lock controls below, so the props are accepted but unread.
const SecuritySettings: React.FC<SecuritySettingsProps> = () => {
  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
          Security & Privacy
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Manage your account security and data privacy.
        </p>
      </div>
      <div className="p-6 divide-y divide-border-light dark:divide-border-dark">
        {/* Biometric Lock Setting
        <div className="py-4 flex justify-between items-center">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Biometric Lock
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Require biometrics to access the app.
            </p>
          </div>
          <Switch
            checked={localSettings?.biometric_lock}
            onCheckedChange={(v) =>
              onSettingsSave({ ...settings, biometric_lock: v })
            }
          />
        </div> */}

        {/* Change Password Setting */}
        <div className="py-4 flex justify-between items-center">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Change Password
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Update your account password.
            </p>
          </div>
          <Link
            to="/change-password"
            className="text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 px-4 py-2 rounded-lg transition-colors"
          >
            Change
          </Link>
        </div>

        {/* Delete Account Setting */}
        <div className="py-4 flex justify-between items-center">
          <div>
            <label className="font-medium text-danger">Delete Account</label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Permanently delete your account and all data.
            </p>
          </div>
          <Link
            to="/delete-account"
            className="text-sm font-semibold text-danger bg-danger/10 hover:bg-danger/20 px-4 py-2 rounded-lg transition-colors"
          >
            Delete
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
