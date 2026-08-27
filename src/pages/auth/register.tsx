import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../../api/axios";
import { AuthLayout } from "../../layouts/AuthLayout";
import {
  Cloud,
  Shield,
  Info,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import zxcvbn from "zxcvbn";
import { useAuth } from "../../hooks/useAuth";
import GoogleLoginElectron, {
  type GoogleLoginResult,
} from "../../components/googleLoginElectron";
import { authService } from "../../api/authService";
import Stepper, { Step } from "../../components/ui/Stepper";
import { motion, AnimatePresence } from "framer-motion"; // Import motion components

// === Themed PasswordStrengthMeter Component ===
interface PasswordStrengthMeterProps {
  onChange?: (value: string) => void;
  password?: string;
}

// --- CHANGE: Themed strength levels ---
const strengthLevels = [
  { text: "Too Weak", color: "bg-danger", textColor: "text-danger" },
  { text: "Weak", color: "bg-warning", textColor: "text-warning" },
  {
    text: "Fair",
    color: "bg-light1 dark:bg-dark1/60",
    textColor: "text-dark1 dark:text-light1/60",
  },
  { text: "Good", color: "bg-success/80", textColor: "text-success/80" },
  { text: "Strong", color: "bg-success", textColor: "text-success" },
];

function PasswordStrengthMeter({
  onChange,
  password,
}: PasswordStrengthMeterProps) {
  const [score, setScore] = useState(-1);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (password) {
      const result = zxcvbn(password);
      setScore(result.score);
      setFeedback(result.feedback.suggestions);
    } else {
      setScore(-1);
      setFeedback([]);
    }
  }, [password]);

  const currentStrengthLevel = score >= 0 ? strengthLevels[score] : null;
  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Create a password"
          aria-label="Enter password"
          className={inputClasses}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-light-sub dark:text-text-dark-sub"
        >
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="text-text-light-sub dark:text-text-dark-sub">
            Password Strength:
          </span>
          {currentStrengthLevel && (
            <span className={`font-semibold ${currentStrengthLevel.textColor}`}>
              {currentStrengthLevel.text}
            </span>
          )}
        </div>
        <div className="h-2 w-full bg-tertiary-light dark:bg-tertiary-dark rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              currentStrengthLevel
                ? currentStrengthLevel.color
                : "bg-transparent"
            }`}
            style={{
              width: currentStrengthLevel ? `${(score + 1) * 20}%` : "0%",
            }}
          />
        </div>
      </div>

      {feedback.length > 0 && (
        <div role="status" aria-live="polite">
          <p className="text-sm font-medium text-text-light-sub dark:text-text-dark-sub mb-2">
            Suggestions to improve:
          </p>
          <ul className="text-sm text-text-light-sub dark:text-text-dark-sub space-y-1 list-disc pl-5">
            {feedback.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// === Themed Register Component ===
export default function Register() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
  });
  const [usernameAvailable, setUsernameAvailable] = useState<null | boolean>(
    null
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"online" | "offline">("offline");
  const [usernameChecking, setUsernameChecking] = useState(false);
  const { login } = useAuth();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [infoBadge, setInfoBadge] = useState<boolean>(true);

  // All logic (handleChange, handleSubmit, etc.) remains the same...
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (value: string) => {
    setForm({ ...form, password: value });
  };

  useEffect(() => {
    if (authMode === "offline") {
      setUsernameAvailable(true);
      return;
    }
    if (!form.username) {
      setUsernameAvailable(null);
      return;
    }

    setUsernameChecking(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await api.post("/auth/check-username", {
          username: form.username,
        });
        if (res.status === 200) {
          setUsernameAvailable(true);
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          setUsernameAvailable(false);
        } else {
          setUsernameAvailable(null);
          console.error("Username check error:", err);
        }
      } finally {
        setUsernameChecking(false);
      }
    }, 1000);

    return () => clearTimeout(delayDebounce);
  }, [form.username, authMode]);

  const handleSubmit = async () => {
    // This function is now called by onFinalStepCompleted
    setError("");
    setIsLoading(true);
    try {
      const payload = {
        ...form,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      await authService.register(authMode, payload);
      navigate("/login");
    } catch (err) {
      console.log(err);
      setError("Registration failed. Try a different username or email.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (result: GoogleLoginResult) => {
    setError("");
    setIsLoading(true);
    try {
      const res = await api.post("/auth/google-login", {
        response: result,
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

  const handleUserNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
    setForm({ ...form, username: value });

    if (value.length < 3) {
      setUsernameError("Username must be at least 3 characters.");
    } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError("Only letters, numbers, and underscores allowed.");
    } else {
      setUsernameError(null);
    }
  };

  useEffect(() => {
    setInfoBadge(true);
  }, [authMode]); // --- Step-specific validation logic ---

  const isStep1Valid =
    form.username.trim() &&
    !usernameError &&
    (authMode === "offline" || (usernameAvailable && !usernameChecking));

  const isStep2Valid =
    form.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const isStep3Valid = form.full_name.trim() !== "";

  const isStep4Valid = form.password && zxcvbn(form.password).score >= 3;

  const shouldDisableNext = useMemo(() => {
    switch (currentStep) {
      case 1:
        return !isStep1Valid;
      case 2:
        return !isStep2Valid;
      case 3:
        return !isStep3Valid;
      case 4:
        return !isStep4Valid;
      default:
        return false;
    }
  }, [currentStep, isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid]);

  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";
  const labelClasses =
    "block text-sm font-medium text-text-light dark:text-text-dark mb-1.5";

  return (
    <AuthLayout
      title="Create your account"
      authMode={authMode}
      setAuthMode={setAuthMode}
    >
      <motion.div layout transition={{ type: "spring", duration: 0.5 }}>
        <Stepper
          initialStep={1}
          onStepChange={setCurrentStep}
          onFinalStepCompleted={handleSubmit}
          className="my-3"
          // Stepper button styling can be customized further if Stepper component is updated
          nextButtonProps={{ disabled: shouldDisableNext }}
        >
          <Step>
            <div className="space-y-4">
              <h2 className="font-display text-xl font-semibold text-text-light dark:text-text-dark">
                Choose your username
              </h2>
              <div>
                <label
                  htmlFor="username"
                  className={`${labelClasses} items-center flex`}
                >
                  Username
                  <div className="relative group">
                    <Info
                      size={14}
                      className="ml-1 text-text-light-sub dark:text-text-dark-sub"
                    />
                    <div className="absolute z-20 hidden group-hover:block bottom-full mb-2 w-max bg-surface-light dark:bg-surface-dark text-text-light-sub dark:text-text-dark-sub text-xs rounded-lg px-3 py-2 shadow-lg border border-border-light dark:border-border-dark">
                      <p className="font-semibold mb-1 text-text-light dark:text-text-dark">
                        Username can include:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>Letters (A–Z, a–z)</li>
                        <li>Numbers (0–9)</li>
                        <li>Underscores (_)</li>
                      </ul>
                    </div>
                  </div>
                </label>
                <input
                  name="username"
                  id="username"
                  type="text"
                  required
                  placeholder="Enter a username"
                  onChange={handleUserNameChange}
                  value={form.username}
                  className={inputClasses}
                />
                {form.username && (
                  <div className="mt-2 text-sm">
                    {usernameError && (
                      <span className="text-danger">{usernameError}</span>
                    )}
                    {authMode === "online" &&
                      !usernameError &&
                      (usernameChecking ? (
                        <span className="text-text-light-sub dark:text-text-dark-sub">
                          Checking...
                        </span>
                      ) : usernameAvailable === true ? (
                        <span className="text-success">
                          Username is available
                        </span>
                      ) : usernameAvailable === false ? (
                        <span className="text-danger">
                          Username already taken
                        </span>
                      ) : null)}
                  </div>
                )}
              </div>
            </div>
          </Step>
          <Step>
            <div className="space-y-4">
              <h2 className="font-display text-xl font-semibold text-text-light dark:text-text-dark">
                What's your email address?
              </h2>
              <div>
                <label htmlFor="email" className={labelClasses}>
                  Email
                </label>
                <input
                  name="email"
                  id="email"
                  type="email"
                  required
                  placeholder="Enter your email"
                  onChange={handleChange}
                  value={form.email}
                  className={inputClasses}
                />
              </div>
            </div>
          </Step>
          <Step>
            <div className="space-y-4">
              <h2 className="font-display text-xl font-semibold text-text-light dark:text-text-dark">
                What should we call you?
              </h2>
              <div>
                <label htmlFor="full_name" className={labelClasses}>
                  Full Name
                </label>
                <input
                  name="full_name"
                  id="full_name"
                  type="text"
                  required
                  className={inputClasses}
                  placeholder="Enter your full name"
                  onChange={handleChange}
                  value={form.full_name}
                />
              </div>
            </div>
          </Step>
          <Step>
            <div className="space-y-4">
              <h2 className="font-display text-xl font-semibold text-text-light dark:text-text-dark">
                Secure your account
              </h2>
              <div>
                <label htmlFor="password" className={labelClasses}>
                  Password
                </label>
                <PasswordStrengthMeter
                  password={form.password}
                  onChange={handlePasswordChange}
                />
              </div>
            </div>
          </Step>
        </Stepper>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-danger/10 text-danger text-sm border border-danger/20 mt-4">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <AnimatePresence>
          {infoBadge && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`border-l-4 p-4 mt-6 rounded-r-lg relative ${
                authMode === "offline"
                  ? "bg-warning/10 border-warning"
                  : "bg-light1 dark:bg-dark1/10 border-info"
              }`}
            >
              <button
                onClick={() => setInfoBadge(false)}
                className="absolute cursor-pointer top-2 right-2 text-text-light-sub dark:text-text-dark-sub"
              >
                <X size={15} />
              </button>
              <div className="flex">
                <div className="flex-shrink-0">
                  {authMode === "offline" ? (
                    <Shield className="h-5 w-5 text-warning" />
                  ) : (
                    <Cloud className="h-5 w-5 text-dark1 dark:text-light1" />
                  )}
                </div>
                <div className="ml-3">
                  <p
                    className={`text-sm ${
                      authMode === "offline"
                        ? "text-yellow-800 dark:text-yellow-200"
                        : "text-blue-800 dark:text-blue-200"
                    }`}
                  >
                    {authMode === "offline"
                      ? "Your information is stored locally and is 100% private."
                      : "Your information is securely stored in the cloud."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            Already have an account?{" "}
          </span>
          <Link
            to="/login"
            className="font-medium text-dark1 dark:text-light1 hover:text-dark1 dark:text-light1/90"
          >
            Login
          </Link>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
