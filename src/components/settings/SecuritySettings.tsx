import type React from "react";
import { Link } from "react-router-dom";
import type { SettingsPanelProps } from "../../types/User";

type SecuritySettingsProps = Pick<
  SettingsPanelProps,
  "settings" | "onSettingsSave"
>;

// `settings`/`onSettingsSave` are accepted for the settings-panel contract but
// unread: the biometric-lock toggle that used them implied a protection the
// app never had, and was removed (MASTER_TODO 19).
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
        {/* What the password does. MASTER_TODO 15 chose option B: the
            password picks the account and keeps people out of the app; it
            does not encrypt anything on disk. Say so where people look. */}
        <div className="py-4">
          <label className="font-medium text-text-light dark:text-text-dark">
            What your password protects
          </label>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
            It keeps other people out of MindSage on this computer. Your journal
            file is not encrypted, so anyone who can open your files outside the
            app can read it. Keep your Windows account locked when you step
            away.
          </p>
        </div>

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
