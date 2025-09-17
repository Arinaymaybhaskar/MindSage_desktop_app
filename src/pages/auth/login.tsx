import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../hooks/useAuth";
import { AuthLayout } from "../../layouts/AuthLayout";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";
import GoogleLoginElectron from "../../components/googleLoginElectron";
import { authService } from "../../api/authService";
import { motion, AnimatePresence } from "framer-motion"; // Import motion components

export default function Login() {
  const [form, setForm] = useState({
    identifier: "",
    password: "",
    rememberMe: false,
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"online" | "offline">("offline");

  // All logic (handleSubmit, handleGoogleSuccess) remains the same...
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      // Using the authService we defined earlier
      const res = await authService.login(authMode, {
        identifier: form.identifier,
        password: form.password,
      });
      login(res.accessToken, res.userInfo, authMode);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Invalid username or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (response: any) => {
    setError("");
    setIsLoading(true);
    try {
      const res = await api.post("/auth/google-login", {
        response,
      });
      login(res.data.accessToken, res.data.userInfo, authMode);
      navigate("/");
    } catch (err) {
      console.error("Google login failed:", err);
      setError("Google login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";
  const labelClasses =
    "block text-sm font-medium text-text-light dark:text-text-dark mb-1.5";

  return (
    <AuthLayout
      title="Welcome back"
      authMode={authMode}
      setAuthMode={setAuthMode}
    >
      {/* --- CHANGE: Added motion.div with layout to animate height changes --- */}
      <motion.div layout transition={{ type: "spring", duration: 0.5 }}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-danger/10 text-danger text-sm border border-danger/20">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
          <div>
            <label htmlFor="identifier" className={labelClasses}>
              Username or Email
            </label>
            <input
              id="identifier"
              name="identifier"
              autoComplete="identifier"
              required
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              className={inputClasses}
              placeholder="Enter your username or email"
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClasses}>
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputClasses}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-light-sub dark:text-text-dark-sub"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={form.rememberMe}
                onChange={(e) =>
                  setForm({ ...form, rememberMe: e.target.checked })
                }
                className="h-4 w-4 text-dark1 dark:text-light1 bg-tertiary-light dark:bg-tertiary-dark border-border-light rounded focus:ring-info"
              />
              <label
                htmlFor="remember-me"
                className="ml-2 block text-sm text-text-light-sub dark:text-text-dark-sub"
              >
                Remember me
              </label>
            </div>
            <div className="text-sm">
              <Link
                to="/forgot-password"
                className="font-medium text-dark1 dark:text-light1 hover:text-dark1 dark:text-light1/90"
              >
                Forgot your password?
              </Link>
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-light1 dark:bg-dark1 hover:bg-light1 dark:bg-dark1/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        {/* --- CHANGE: Wrapped Google login in AnimatePresence for smooth entry/exit --- */}
        <AnimatePresence>
          {authMode === "online" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
            >
              <GoogleLoginElectron
                onError={() => console.log("Error in google login")}
                onSuccess={handleGoogleSuccess}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 text-center text-sm">
          <span className="text-text-light-sub dark:text-text-dark-sub">
            Don't have an account?
          </span>{" "}
          <Link
            to="/register"
            className="font-medium text-dark1 dark:text-light1 hover:text-dark1 dark:text-light1/90"
          >
            Sign up
          </Link>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
