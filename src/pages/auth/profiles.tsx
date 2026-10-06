import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Plus,
} from "lucide-react";
import { AuthLayout } from "../../layouts/AuthLayout";
import { authService, type Profile } from "../../api/authService";
import { useAuth } from "../../hooks/useAuth";
import { errorMessage } from "../../utils/errors";

/** Two initials from the full name, or the first letter of the username. */
function initials(p: Profile) {
  const words = (p.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.[0] ?? p.username[0] ?? "?").toUpperCase();
}

function Avatar({ profile, size }: { profile: Profile; size: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-tertiary-light dark:bg-tertiary-dark flex items-center justify-center font-display font-semibold text-text-light dark:text-text-dark ring-1 ring-border-light dark:ring-border-dark"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {profile.avatar ? (
        <img
          src={profile.avatar}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initials(profile)
      )}
    </div>
  );
}

const displayName = (p: Profile) => p.full_name || p.username;

/**
 * The signed-out front door: every account on this install, then a password
 * for the one picked. Usernames are shown on purpose. The password picks
 * whose journal this is and keeps others out of the app; it is not a secret
 * that hides who has an account (MASTER_TODO 15, option B).
 */
export default function Profiles() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Registration sends people back here with the new username, so the
  // picker can open straight on their password.
  const preselect = (location.state as { select?: string } | null)?.select;

  useEffect(() => {
    authService
      .listProfiles()
      .then((list) => {
        setProfiles(list);
        const match = preselect && list.find((p) => p.username === preselect);
        if (match) setSelected(match);
      })
      .catch((err) => {
        console.error("Could not list profiles:", err);
        setProfiles([]);
      });
  }, [preselect]);

  const choose = (p: Profile) => {
    setSelected(p);
    setPassword("");
    setError("");
  };

  const back = () => {
    setSelected(null);
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await authService.login({
        identifier: selected.username,
        password,
        rememberMe,
      });
      login(res.userInfo);
      navigate("/");
    } catch (err) {
      setError(
        /Incorrect password/i.test(errorMessage(err, ""))
          ? "That password isn't right. Try again."
          : errorMessage(err, "Couldn't sign in"),
      );
      setPassword("");
      passwordRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";

  return (
    <AuthLayout
      title={
        selected
          ? `Welcome back, ${displayName(selected)}`
          : "Who's journaling?"
      }
      subtitle={
        selected
          ? "Enter your password to open your journal."
          : "Choose your profile. Everything stays on this computer."
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {!selected ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {profiles === null ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-light-sub dark:text-text-dark-sub">
                <Loader2 size={16} className="animate-spin" />
                Loading profiles
              </div>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      className="group w-full flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
                    >
                      <div className="transition-transform group-hover:scale-105">
                        <Avatar profile={p} size={72} />
                      </div>
                      <span className="w-full truncate text-sm font-medium text-text-light dark:text-text-dark">
                        {displayName(p)}
                      </span>
                      {p.full_name && (
                        <span className="-mt-2 w-full truncate text-xs text-text-light-sub dark:text-text-dark-sub">
                          @{p.username}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                <li>
                  <Link
                    to="/register"
                    className="group w-full flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
                  >
                    <div
                      className="flex items-center justify-center rounded-full border-2 border-dashed border-border-light dark:border-border-dark text-text-light-sub dark:text-text-dark-sub transition-transform group-hover:scale-105"
                      style={{ width: 72, height: 72 }}
                    >
                      <Plus size={26} />
                    </div>
                    <span className="text-sm font-medium text-text-light dark:text-text-dark">
                      Add new user
                    </span>
                  </Link>
                </li>
              </ul>
            )}
            {profiles?.length === 0 && (
              <p className="mt-4 text-center text-sm text-text-light-sub dark:text-text-dark-sub">
                No profiles yet. Add one to start your journal.
              </p>
            )}
          </motion.div>
        ) : (
          <motion.form
            key="password"
            onSubmit={handleSubmit}
            className="space-y-5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex flex-col items-center gap-2">
              <Avatar profile={selected} size={88} />
              {selected.full_name && (
                <span className="text-sm text-text-light-sub dark:text-text-dark-sub">
                  @{selected.username}
                </span>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-md bg-danger/10 text-danger text-sm border border-danger/20"
              >
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            <div>
              <label htmlFor="profile-password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <input
                  id="profile-password"
                  ref={passwordRef}
                  // Mounts only after the grid's exit animation, so an effect
                  // keyed on the selection would find no input to focus.
                  autoFocus
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className={`${inputClasses} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-text-light-sub dark:text-text-dark-sub"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-border-light bg-tertiary-light dark:bg-tertiary-dark focus:ring-info"
                />
                Keep me signed in
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-dark1 dark:text-light1"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full flex justify-center py-2.5 px-4 rounded-md shadow-sm text-sm font-medium text-white bg-light1 dark:bg-dark1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            <button
              type="button"
              onClick={back}
              className="w-full flex items-center justify-center gap-2 text-sm text-text-light-sub dark:text-text-dark-sub hover:text-text-light dark:hover:text-text-dark transition-colors"
            >
              <ArrowLeft size={16} />
              Not you? Choose another profile
            </button>

            <p className="text-xs text-center text-text-light-sub dark:text-text-dark-sub">
              Your password keeps other people out of MindSage on this computer.
              It does not encrypt your journal file.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
