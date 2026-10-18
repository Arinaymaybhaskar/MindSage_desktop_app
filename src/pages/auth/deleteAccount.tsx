import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Save,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  userService,
  type DeleteProfileResult,
  type ProfileSummary,
} from "../../api/userService";
import { portabilityService } from "../../api/portabilityService";
import HoldButton from "../../components/HoldButton";
import { clearLocalTraces } from "../../utils/clearLocalTraces";

type Step = "review" | "password" | "hold" | "deleted";
type Backup =
  | { state: "none" }
  | { state: "saving" }
  | { state: "saved"; count?: number }
  | { state: "skipped" }
  | { state: "failed"; message: string };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const megabytes = (bytes: number) =>
  bytes < 1024 * 1024 ? "under 1 MB" : `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Deleting a profile: see what goes, optionally save a backup first, confirm
 * with the password, hold a button to delete, then a screen saying it is done.
 * A wrong password deletes nothing and is counted by the main process.
 */
export function DeleteAccount() {
  const [step, setStep] = useState<Step>("review");
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [backup, setBackup] = useState<Backup>({ state: "none" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<DeleteProfileResult | null>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    userService
      .deleteSummary()
      .then(setSummary)
      .catch(() => setError("Could not read what this profile contains."));
  }, []);

  const saveBackup = async () => {
    setBackup({ state: "saving" });
    try {
      const filePath = await portabilityService.pickExportPath("mindsage");
      if (!filePath) {
        setBackup({ state: "none" }); // cancelled the dialog: still undecided
        return;
      }
      const r = await portabilityService.exportJournal("mindsage", filePath);
      if (!r?.success) throw new Error("The backup could not be written.");
      setBackup({ state: "saved", count: r.count });
    } catch (err) {
      setBackup({
        state: "failed",
        message:
          err instanceof Error && err.message
            ? err.message
            : "The backup could not be saved.",
      });
    }
  };

  const canContinue = backup.state === "saved" || backup.state === "skipped";

  const deleteNow = async () => {
    setIsDeleting(true);
    setError("");
    try {
      setResult(await userService.deleteAccount({ password }));
      setStep("deleted");
    } catch (err) {
      // Nothing was deleted. Back to the password, with what went wrong.
      setError(
        err instanceof Error
          ? err.message.replace(
              /^Error invoking remote method '[^']*': (Error: )?/,
              "",
            )
          : "Deletion failed.",
      );
      setPassword("");
      setStep("password");
    } finally {
      setIsDeleting(false);
    }
  };

  const finish = () => {
    clearLocalTraces(Boolean(result?.lastProfile));
    logout();
    navigate(result?.lastProfile ? "/setup" : "/profiles");
    window.location.reload();
  };

  const button =
    "w-full justify-center flex items-center gap-2 font-medium rounded-lg px-5 py-2.5 transition-colors disabled:opacity-50";
  const secondary = `${button} bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80`;
  const danger = `${button} bg-danger hover:bg-danger/90 text-white`;
  const inputClasses =
    "pl-10 w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:ring-2 focus:ring-info focus:border-info outline-none transition";

  return (
    <div className="bg-base-light dark:bg-base-dark min-h-[calc(100vh-40px)] flex items-center justify-center px-4 py-12">
      <main className="max-w-2xl w-full">
        {step !== "deleted" && (
          <Link
            to="/settings#security"
            className="flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub font-semibold transition-colors mb-6"
          >
            <ArrowLeft size={18} />
            Back to Settings
          </Link>
        )}

        <div className="bg-secondary-light dark:bg-secondary-dark rounded-2xl shadow-lg border border-border-light dark:border-border-dark p-6 sm:p-8">
          {step === "deleted" ? (
            <div className="text-center" role="status">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-success" />
              <h1 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
                Your profile was deleted
              </h1>
              <p className="mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                Your entries, photos, recordings, goals, chats and settings are
                gone from this computer
                {result?.backupsRemoved
                  ? ", along with the database backups"
                  : ""}
                .
                {result && !result.lastProfile
                  ? " Database backups stay, because they also protect the other profiles here."
                  : ""}
                {result?.searchCleanupPending
                  ? " Search will finish clearing your entries the next time it is running."
                  : ""}
              </p>
              <button onClick={finish} className={`${danger} mt-6`}>
                {result?.lastProfile ? "Start fresh" : "Choose a profile"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center mb-4 text-danger">
                <AlertCircle size={24} className="mr-3" />
                <h1 className="font-display text-xl font-bold">
                  Delete this profile
                </h1>
              </div>

              {step === "review" && (
                <section aria-label="What will be deleted">
                  <p className="mb-3 text-text-light-sub dark:text-text-dark-sub">
                    This permanently removes, from this computer:
                  </p>
                  {summary ? (
                    <ul className="list-disc pl-5 mb-5 space-y-1 text-text-light-sub dark:text-text-dark-sub">
                      <li>
                        {plural(
                          summary.entries,
                          "journal entry",
                          "journal entries",
                        )}
                        {summary.trashedEntries > 0
                          ? ` and ${plural(summary.trashedEntries, "entry", "entries")} in the Trash`
                          : ""}
                      </li>
                      <li>
                        {plural(summary.photos, "photo")} and{" "}
                        {plural(summary.recordings, "recording")} (
                        {megabytes(summary.mediaBytes)})
                      </li>
                      <li>
                        {plural(summary.goals + summary.trashedGoals, "goal")}{" "}
                        and their progress
                      </li>
                      <li>{plural(summary.chats, "Ask conversation")}</li>
                      <li>Your settings, and your entries in search</li>
                      {summary.otherProfiles === 0 && (
                        <li>
                          The database backups MindSage made (this is the last
                          profile here)
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mb-5 text-sm text-text-light-sub dark:text-text-dark-sub">
                      {error || "Reading your profile…"}
                    </p>
                  )}
                  {summary && summary.otherProfiles > 0 && (
                    <p className="mb-5 text-sm text-text-light-sub dark:text-text-dark-sub">
                      Other profiles on this computer are not touched. Database
                      backups stay, because they also protect them.
                    </p>
                  )}

                  <div className="rounded-lg border border-border-light dark:border-border-dark p-4 mb-5">
                    <h2 className="font-semibold text-text-light dark:text-text-dark mb-1">
                      Save a backup first?
                    </h2>
                    <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-3">
                      A backup is a file you keep; you can import it into
                      MindSage again later.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={saveBackup}
                        disabled={backup.state === "saving"}
                        className={secondary}
                      >
                        {backup.state === "saving" ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Save size={18} />
                        )}
                        {backup.state === "saved"
                          ? "Save another backup"
                          : "Save a backup…"}
                      </button>
                      <button
                        onClick={() => setBackup({ state: "skipped" })}
                        disabled={backup.state === "saving"}
                        aria-pressed={backup.state === "skipped"}
                        className={`${secondary} ${backup.state === "skipped" ? "ring-2 ring-danger" : ""}`}
                      >
                        Delete without a backup
                      </button>
                    </div>
                    {backup.state === "saved" && (
                      <p className="mt-3 text-sm text-success" role="status">
                        Backup saved
                        {backup.count !== undefined
                          ? ` (${plural(backup.count, "entry", "entries")})`
                          : ""}
                        .
                      </p>
                    )}
                    {backup.state === "failed" && (
                      <p className="mt-3 text-sm text-danger" role="alert">
                        {backup.message} Nothing has been deleted. Try again,
                        pick another place (a full disk is a common cause), or
                        choose to delete without a backup.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setStep("password")}
                    disabled={!canContinue || !summary}
                    className={danger}
                  >
                    Continue
                  </button>
                  {!canContinue && (
                    <p className="mt-2 text-xs text-text-light-sub dark:text-text-dark-sub text-center">
                      Save a backup, or choose to delete without one, to
                      continue.
                    </p>
                  )}
                </section>
              )}

              {step === "password" && (
                <form
                  onSubmit={(e: React.FormEvent) => {
                    e.preventDefault();
                    if (!password) {
                      setError("Please enter your password to continue.");
                      return;
                    }
                    setError("");
                    setStep("hold");
                  }}
                >
                  <label
                    htmlFor="password"
                    className="block mb-2 font-medium text-text-light dark:text-text-dark"
                  >
                    Confirm your password to continue
                  </label>
                  <div className="relative mb-2">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <Lock
                        size={16}
                        className="text-text-light-sub dark:text-text-dark-sub"
                      />
                    </div>
                    <input
                      type="password"
                      id="password"
                      autoFocus
                      className={`${inputClasses} ${error ? "border-danger" : ""}`}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                    />
                  </div>
                  {error && (
                    <p className="mb-3 text-sm text-danger" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button type="submit" className={danger}>
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword("");
                        setError("");
                        setStep("review");
                      }}
                      className={secondary}
                    >
                      Back
                    </button>
                  </div>
                </form>
              )}

              {step === "hold" && (
                <section aria-label="Confirm deletion">
                  <h2 className="font-semibold mb-2 text-text-light dark:text-text-dark">
                    Last step
                  </h2>
                  <p className="mb-5 text-sm text-text-light-sub dark:text-text-dark-sub">
                    This cannot be undone. Press and hold the button to delete
                    this profile for good.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <HoldButton
                      label="Hold to delete"
                      holdingLabel="Keep holding to delete…"
                      onComplete={deleteNow}
                      disabled={isDeleting}
                      className="w-full"
                    />
                    <button
                      onClick={() => setStep("password")}
                      disabled={isDeleting}
                      className={secondary}
                    >
                      Cancel
                    </button>
                  </div>
                  {isDeleting && (
                    <p
                      className="mt-3 text-sm text-text-light-sub dark:text-text-dark-sub flex items-center gap-2"
                      role="status"
                    >
                      <Loader2 size={16} className="animate-spin" /> Deleting…
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
