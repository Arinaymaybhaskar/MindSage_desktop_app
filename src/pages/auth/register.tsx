import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../layouts/AuthLayout";
import { Shield, X, Eye, EyeOff, AlertTriangle } from "lucide-react";
import type { ZXCVBNResult } from "zxcvbn";
import { authService } from "../../api/authService";

type Zxcvbn = (password: string, userInputs?: string[]) => ZXCVBNResult;

/** The rule sign-up has always had: zxcvbn must score the password 3 or more. */
const MIN_SCORE = 3;

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

export default function Register() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [nameAvailable, setNameAvailable] = useState<null | boolean>(null);
  const [zxcvbn, setZxcvbn] = useState<Zxcvbn | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [infoBadge, setInfoBadge] = useState(true);
  const navigate = useNavigate();
  const restore = (useLocation().state as { restore?: boolean } | null)
    ?.restore;

  // zxcvbn is about 800 KB; importing it here, not at the top, keeps it out of
  // the bundle every other screen loads.
  useEffect(() => {
    let live = true;
    void import("zxcvbn").then((m) => {
      if (live) setZxcvbn(() => m.default);
    });
    return () => {
      live = false;
    };
  }, []);

  const nameError =
    name && name.length < 3
      ? "Profile name must be at least 3 characters."
      : "";

  // Live duplicate check, debounced; a stale answer for an older name is ignored.
  useEffect(() => {
    setNameAvailable(null);
    if (!name || nameError) return;
    let live = true;
    const timer = setTimeout(() => {
      authService
        .checkUsername(name)
        .then(({ available }) => live && setNameAvailable(available))
        .catch(() => live && setNameAvailable(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name, nameError]);

  const strength = useMemo(
    () => (zxcvbn && password ? zxcvbn(password, [name]) : null),
    [zxcvbn, password, name],
  );
  const level = strength ? strengthLevels[strength.score] : null;
  const passwordError =
    strength && strength.score < MIN_SCORE
      ? "This password is too easy to guess. Make it longer or less common."
      : "";

  const photoUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  const canSubmit =
    nameAvailable === true &&
    !!strength &&
    strength.score >= MIN_SCORE &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await authService.register({
        username: name,
        password,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        photo: photo
          ? { arrayBuffer: await photo.arrayBuffer(), filename: photo.name }
          : undefined,
      });
      // Straight to the new profile's password, not back to the full grid.
      navigate("/profiles", { state: { select: name, restore } });
    } catch (err) {
      if (String(err).includes("already exists")) setNameAvailable(false);
      else setError("Could not create the profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";
  const labelClasses =
    "block text-sm font-medium text-text-light dark:text-text-dark mb-1.5";
  const subText = "text-text-light-sub dark:text-text-dark-sub";

  return (
    <AuthLayout title="Create your profile">
      <form onSubmit={handleSubmit} className="space-y-5 my-3" noValidate>
        <div>
          <label htmlFor="username" className={labelClasses}>
            Profile name
          </label>
          <input
            id="username"
            type="text"
            required
            autoFocus
            placeholder="Letters, numbers and underscores"
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^\w]/g, ""))}
            aria-invalid={!!nameError || nameAvailable === false}
            aria-describedby="username-status"
            className={inputClasses}
          />
          <div
            id="username-status"
            role="status"
            aria-live="polite"
            className="mt-2 text-sm"
          >
            {nameError ? (
              <span className="text-danger">{nameError}</span>
            ) : !name ? null : nameAvailable === null ? (
              <span className={subText}>Checking...</span>
            ) : nameAvailable ? (
              <span className="text-success">This name is free.</span>
            ) : (
              <span className="text-danger">
                This name is already used on this PC.
              </span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="photo" className={labelClasses}>
            Photo (optional)
          </label>
          <div className="flex items-center gap-3">
            {photoUrl && (
              <img
                src={photoUrl}
                alt="Your profile photo"
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className={`text-sm ${subText}`}
            />
            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className={`text-sm underline ${subText}`}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label htmlFor="password" className={labelClasses}>
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              aria-invalid={!!passwordError}
              aria-describedby="password-status"
              className={inputClasses}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className={`absolute inset-y-0 right-0 pr-3 flex items-center ${subText}`}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="flex items-center justify-between text-sm font-medium">
            <span className={subText}>Password strength:</span>
            {level && (
              <span className={`font-semibold ${level.textColor}`}>
                {level.text}
              </span>
            )}
          </div>
          <div className="h-2 w-full bg-tertiary-light dark:bg-tertiary-dark rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${level ? level.color : "bg-transparent"}`}
              style={{
                width: strength ? `${(strength.score + 1) * 20}%` : "0%",
              }}
            />
          </div>
          <div id="password-status" role="status" aria-live="polite">
            {passwordError && (
              <p className="text-sm text-danger">{passwordError}</p>
            )}
            {strength && strength.feedback.suggestions.length > 0 && (
              <ul
                className={`mt-1 text-sm space-y-1 list-disc pl-5 ${subText}`}
              >
                {strength.feedback.suggestions.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-2.5 rounded-lg bg-dark1 dark:bg-light1 text-white dark:text-dark1 font-semibold disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create profile"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 rounded-md bg-danger/10 text-danger text-sm border border-danger/20 mt-4"
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {infoBadge && (
        <div className="border-l-4 p-4 mt-6 rounded-r-lg relative bg-warning/10 border-warning">
          <button
            onClick={() => setInfoBadge(false)}
            aria-label="Dismiss"
            className={`absolute cursor-pointer top-2 right-2 ${subText}`}
          >
            <X size={15} />
          </button>
          <div className="flex">
            <div className="flex-shrink-0">
              <Shield className="h-5 w-5 text-warning" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Your information is stored locally and is 100% private.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 text-center text-sm">
        <span className={subText}>Already have a profile? </span>
        <Link
          to="/profiles"
          className="font-medium text-dark1 dark:text-light1 hover:text-dark1 dark:text-light1/90"
        >
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
