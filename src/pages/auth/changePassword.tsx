import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Save, AlertTriangle, ArrowLeft } from "lucide-react";
import { userService } from "../../api/userService";
import { useAuth } from "../../hooks/useAuth";
import clsx from "clsx";
import { useToast } from "../../hooks/useToast";

const ChangePassword = () => {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { showToast } = useToast();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    "offline" | "online";

  const [form, setForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [invalidOldPassword, setInvalidOldPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(""); // Clear general error on any change
    setInvalidOldPassword(false); // Clear specific old password error
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const toggleVisibility = (field: "old" | "new" | "confirm") => {
    setShowPassword((prev) => ({ ...prev, [field]: !showPassword[field] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    showToast("Updating password...", "info");

    try {
      const payload = {
        old_password: form.oldPassword,
        new_password: form.newPassword,
      };
      await userService.changePassword(authMode, accessToken!, payload);

      showToast("Password updated successfully.", "success");
      navigate("/settings#security");
    } catch (err) {
      console.error(err);
      showToast(
        "Failed to change password. Please check your old password.",
        "danger",
      );
      setInvalidOldPassword(true);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";
  const labelClasses =
    "block text-sm font-medium text-text-light dark:text-text-dark mb-1.5";
  const passwordsMismatch =
    form.newPassword &&
    form.confirmPassword &&
    form.newPassword !== form.confirmPassword;

  return (
    <>
      <div className="bg-base-light dark:bg-base-dark min-h-[calc(100vh-40px)] flex items-center justify-center px-4 py-12">
        <main className="max-w-md w-full">
          <Link
            to="/settings#security"
            className="flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub hover:text-dark1 dark:text-light1 dark:hover:text-dark1 dark:text-light1 font-semibold transition-colors mb-6"
          >
            <ArrowLeft size={18} />
            Back to Settings
          </Link>
          <h1 className="font-display text-3xl font-bold text-center text-text-light dark:text-text-dark mb-2">
            Change Password
          </h1>
          <p className="text-center text-text-light-sub dark:text-text-dark-sub mb-8">
            Choose a strong, new password to keep your account secure.
          </p>

          <form
            onSubmit={handleSubmit}
            className="space-y-6 bg-secondary-light dark:bg-secondary-dark p-8 rounded-2xl shadow-lg border border-border-light dark:border-border-dark"
          >
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-danger/10 text-danger text-sm border border-danger/20">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            {/* Old Password */}
            <div>
              <label className={labelClasses}>Old Password</label>
              <div className="relative">
                <input
                  type={showPassword.old ? "text" : "password"}
                  name="oldPassword"
                  value={form.oldPassword}
                  onChange={handleChange}
                  required
                  className={clsx(inputClasses, {
                    "border-danger": invalidOldPassword,
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-light-sub dark:text-text-dark-sub"
                  onClick={() => toggleVisibility("old")}
                >
                  {showPassword.old ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className={labelClasses}>New Password</label>
              <div className="relative">
                <input
                  type={showPassword.new ? "text" : "password"}
                  name="newPassword"
                  value={form.newPassword}
                  onChange={handleChange}
                  required
                  className={inputClasses}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-light-sub dark:text-text-dark-sub"
                  onClick={() => toggleVisibility("new")}
                >
                  {showPassword.new ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className={labelClasses}>Confirm New Password</label>
              <div className="relative">
                <input
                  type={showPassword.confirm ? "text" : "password"}
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  className={clsx(inputClasses, {
                    "border-danger": passwordsMismatch,
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-light-sub dark:text-text-dark-sub"
                  onClick={() => toggleVisibility("confirm")}
                >
                  {showPassword.confirm ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
              {passwordsMismatch && (
                <p className="text-danger text-xs mt-1">
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-light1 dark:bg-dark1 hover:bg-light1 dark:bg-dark1/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={16} />
              {isLoading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </main>
      </div>
    </>
  );
};

export default ChangePassword;
