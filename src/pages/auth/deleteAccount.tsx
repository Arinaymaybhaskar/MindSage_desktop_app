import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertCircle, Lock, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { userService } from "../../api/userService";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "../../hooks/useToast";

export function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    "offline" | "online";

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Please enter your password to continue.");
      return;
    }
    setConfirmDelete(true);
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    showToast("Deleting your account...", "info");
    try {
      await userService.deleteAccount(authMode, accessToken!, { password });
      showToast("Your account has been deleted.", "success");
      logout(); // Log the user out
      navigate("/login");
      window.location.reload();
    } catch (error) {
      showToast(
        "Deletion failed. Please check your password and try again.",
        "danger",
      );
      console.error(error);
      setIsDeleting(false);
      setConfirmDelete(false); // Go back to password step
      setPassword("");
    }
  };

  const handleCancel = () => {
    setConfirmDelete(false);
    setPassword("");
    setError("");
  };

  const inputClasses =
    "pl-10 w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";

  return (
    <>
      <div className="bg-base-light dark:bg-base-dark min-h-[calc(100vh-40px)] flex items-center justify-center px-4 py-12">
        <main className="max-w-2xl w-full">
          <div className="w-full">
            <Link
              to="/settings#security"
              className="flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub hover:text-dark1 dark:text-light1 dark:hover:text-dark1 dark:text-light1 font-semibold transition-colors mb-6"
            >
              <ArrowLeft size={18} />
              Back to Settings
            </Link>

            <div className="bg-secondary-light dark:bg-secondary-dark rounded-2xl shadow-lg border border-border-light dark:border-border-dark p-6 sm:p-8">
              <div className="flex items-center mb-4 text-danger">
                <AlertCircle size={24} className="mr-3" />
                <h1 className="font-display text-xl font-bold">
                  Delete Account
                </h1>
              </div>
              <p className="mb-4 text-text-light-sub dark:text-text-dark-sub">
                Deleting your account will permanently remove all your data,
                including:
              </p>
              <ul className="list-disc pl-5 mb-6 space-y-1 text-text-light-sub dark:text-text-dark-sub">
                <li>All your journal entries and media</li>
                <li>Your goals and progress</li>
                <li>Account settings and preferences</li>
              </ul>
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 mb-6">
                <p className="text-danger font-medium text-sm">
                  This action cannot be undone. Please be certain before you
                  proceed.
                </p>
              </div>

              <AnimatePresence mode="wait">
                {!confirmDelete ? (
                  <motion.form
                    key="password-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onSubmit={handleSubmit}
                  >
                    <div className="mb-4">
                      <label
                        htmlFor="password"
                        className="block mb-2 font-medium text-text-light dark:text-text-dark"
                      >
                        Confirm your password to continue
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                          <Lock
                            size={16}
                            className="text-text-light-sub dark:text-text-dark-sub"
                          />
                        </div>
                        <input
                          type="password"
                          id="password"
                          className={`${inputClasses} ${
                            error ? "border-danger" : ""
                          }`}
                          placeholder="Enter your password"
                          value={password}
                          onChange={handlePasswordChange}
                        />
                      </div>
                      {error && (
                        <p className="mt-2 text-sm text-danger">{error}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="w-full justify-center flex items-center gap-2 bg-danger hover:bg-danger/90 text-white font-medium rounded-lg px-5 py-2.5 transition-colors"
                    >
                      Continue
                    </button>
                  </motion.form>
                ) : (
                  <motion.div
                    key="confirm-dialog"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <h3 className="font-semibold mb-4 text-text-light dark:text-text-dark">
                      Are you absolutely sure you want to delete your account?
                    </h3>
                    <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={isDeleting}
                        className="w-full flex justify-center items-center gap-2 bg-danger hover:bg-danger/90 text-white font-medium rounded-lg px-5 py-2.5 transition-colors disabled:opacity-60"
                      >
                        {isDeleting ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : null}
                        {isDeleting ? "Deleting..." : "Yes, Delete My Account"}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={isDeleting}
                        className="w-full justify-center bg-tertiary-light dark:bg-tertiary-dark hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 text-text-light dark:text-text-dark font-medium rounded-lg px-5 py-2.5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
