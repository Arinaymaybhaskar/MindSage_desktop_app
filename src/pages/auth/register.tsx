import { useEffect, useState, useMemo, use } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api/axios";
import { AuthLayout } from "../../layouts/AuthLayout";
import { CloudIcon, ShieldIcon, InfoIcon, X } from "lucide-react";
import zxcvbn from "zxcvbn";
import { useAuth } from "../../hooks/useAuth";
import GoogleLoginElectron from "../../components/googleLoginElectron";
import { authService } from "../../api/authService";
import Stepper, { Step } from "../../components/ui/Stepper";
import { Eye, EyeOff } from "lucide-react";

// === PasswordStrengthMeter Component ===
interface PasswordStrengthMeterProps {
  onChange?: (value: string) => void;
  password?: string;
}

const strengthLevels = [
  { text: "Too Weak", color: "bg-red-500", textColor: "text-red-500" },
  { text: "Weak", color: "bg-orange-500", textColor: "text-orange-500" },
  { text: "Fair", color: "bg-yellow-500", textColor: "text-yellow-500" },
  { text: "Good", color: "bg-green-500", textColor: "text-green-500" },
  { text: "Strong", color: "bg-emerald-600", textColor: "text-emerald-600" },
];

function PasswordStrengthMeter({
  onChange,
  password,
}: PasswordStrengthMeterProps) {
  const [score, setScore] = useState(-1);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const strengthResult = useMemo(() => {
    if (!password) {
      return null;
    }
    return zxcvbn(password);
  }, [password]);

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

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Create a password"
          aria-label="Enter password"
          className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 transition-colors"
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="text-gray-600">Password Strength:</span>
          {currentStrengthLevel && (
            <span className={`font-semibold ${currentStrengthLevel.textColor}`}>
              {currentStrengthLevel.text}
            </span>
          )}
        </div>
        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              currentStrengthLevel ? currentStrengthLevel.color : "bg-gray-300"
            }`}
            style={{
              width: currentStrengthLevel ? `${(score + 1) * 20}%` : "0%",
            }}
          />
        </div>
      </div>

      {feedback.length > 0 && (
        <div role="status" aria-live="polite">
          <p className="text-sm font-medium text-gray-600 mb-2">
            Suggestions to improve:
          </p>
          <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
            {feedback.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// === Register Component ===
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
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [infoBadge, setInfoBadge] = useState<boolean>(true);

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
      } catch (err: any) {
        if (err.response?.status === 409) {
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

  const handleGoogleSuccess = async (
    response: google.accounts.id.CredentialResponse
  ) => {
    setError("");
    setIsLoading(true);
    try {
      const res = await api.post("/auth/google-login", {
        credential: response.credential,
      });
      login(res.data.accessToken, res.data.refreshToken, authMode);
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

  useEffect(()=>{
    setInfoBadge(true);
  }, [authMode])

  // --- Step-specific validation logic ---
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
  }, [
    currentStep,
    isStep1Valid,
    isStep2Valid,
    isStep3Valid,
    isStep4Valid,
    form.password,
  ]);

  return (
    <AuthLayout title="Register" authMode={authMode} setAuthMode={setAuthMode}>
      <Stepper
        initialStep={1}
        onStepChange={(step) => {
          setCurrentStep(step);
        }}
        onFinalStepCompleted={handleSubmit}
        backButtonText="Previous"
        nextButtonText="Next"
        completeButtonText={isLoading ? "Creating Profile" : "Complete"}
        className="my-3"
        nextButtonProps={{
          disabled: shouldDisableNext,
        }}
      >
        <Step>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Let's hook you up with a username!
            </h2>
            <div>
              <label
                htmlFor="username"
                className=" text-sm font-medium items-center flex text-gray-700"
              >
                Username
                <div className="relative group">
                  <InfoIcon size={14} className="ml-1" />
                  <div className="absolute z-20 hidden group-hover:block bottom-full mb-1 w-max bg-white text-gray-700 text-xs rounded px-3 py-3 shadow-2xl">
                    <p className="font-semibold mb-1">Username can include:</p>
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
                className="appearance-none mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              />
              {form.username && (
                <div className="mt-1 text-sm">
                  {usernameError ? (
                    <span className="text-red-600">{usernameError}</span>
                  ) : null}
                  {authMode === "online" &&
                    (usernameChecking ? (
                      <span className="text-gray-500">
                        Checking availability...
                      </span>
                    ) : usernameAvailable === true ? (
                      <span className="text-green-600">
                        Username is available
                      </span>
                    ) : usernameAvailable === false ? (
                      <span className="text-red-600">
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
            <h2 className="text-xl font-semibold text-gray-900">
              How should we contact you?
            </h2>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                name="email"
                id="email"
                type="text"
                required
                placeholder="Enter your email"
                onChange={handleChange}
                value={form.email}
                className="appearance-none mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              />
            </div>
          </div>
        </Step>
        <Step>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">
              How about your name?
            </h2>
            <div>
              <label
                htmlFor="full_name"
                className="block text-sm font-medium text-gray-700"
              >
                Full Name
              </label>
              <input
                name="full_name"
                id="full_name"
                type="text"
                required
                className="appearance-none mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none sm:text-sm"
                placeholder="Enter your full name"
                onChange={handleChange}
                value={form.full_name}
              />
            </div>
          </div>
        </Step>
        <Step>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Finally, a secure password for your account
            </h2>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
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
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm mt-4">
          {error}
        </div>
      )}
      {infoBadge && (
        <div
          className={`${
            authMode === "offline"
              ? "bg-yellow-50 border-yellow-400"
              : "bg-purple-50 border-purple-400"
          } border-l-4 p-4 mt-6 rounded-md pr-6 pt-6 relative`}
        >
          <button
            onClick={() => setInfoBadge(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
          <div className="flex">
            <div className="flex-shrink-0">
              {authMode === "offline" ? (
                <ShieldIcon className="h-5 w-5 text-yellow-400" />
              ) : (
                <CloudIcon className="h-5 w-5 text-purple-400" />
              )}
            </div>
            <div className="ml-3">
              <p
                className={`text-sm ${
                  authMode === "offline" ? "text-yellow-700" : "text-purple-700"
                }`}
              >
                {authMode === "offline"
                  ? "This is a 100% offline app. Your information is stored locally on this device and will not be sent to any server unless you choose to."
                  : "Your information will be securely stored in the cloud and accessible from any device you log in from."}
              </p>
            </div>
          </div>
        </div>
      )}

      {authMode === "online" && (
        <GoogleLoginElectron
          onError={() => console.log("Error in google login")}
          onSuccess={handleGoogleSuccess}
        />
      )}
      <div className="mt-6 text-center text-sm">
        <span className="text-gray-600">Already have an account? </span>
        <Link
          to="/login"
          className="font-medium text-emerald-600 hover:text-emerald-500"
        >
          Login
        </Link>
      </div>
    </AuthLayout>
  );
}
