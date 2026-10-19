import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Check, Loader2, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useDeleteProfileDialog } from "../hooks/useDeleteProfileDialog";
import { deleteProfileDialog } from "../utils/deleteProfileDialog";
import {
  userService,
  type DeleteProfileResult,
  type ProfileSummary,
} from "../api/userService";
import { clearLocalTraces } from "../utils/clearLocalTraces";
import HoldButton from "./HoldButton";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * "Delete {name}'s profile?": what goes, what stays, the password, and a button
 * that has to be held. A wrong password deletes nothing and is counted by the
 * main process. It is mounted once, outside the routes, so the "deleted" screen
 * survives the sign-out that deleting causes.
 */
export default function DeleteProfileDialog() {
  const { open, name, backupPath } = useDeleteProfileDialog();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<DeleteProfileResult | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  // Each time it opens: a clean slate, and what this profile holds.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    setPassword("");
    setError("");
    setResult(null);
    setIsDeleting(false);
    setSummary(null);
    userService
      .deleteSummary()
      .then(setSummary)
      .catch(() => setError("Could not read what this profile contains."));
    const t = setTimeout(() => passwordRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const close = useCallback(() => {
    if (!isDeleting) deleteProfileDialog.close();
  }, [isDeleting]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !result) {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input, a[href]",
    );
    if (!nodes?.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const deleteNow = async () => {
    setIsDeleting(true);
    setError("");
    try {
      setResult(await userService.deleteAccount({ password }));
    } catch (err) {
      // Nothing was deleted. Stay here, with what went wrong.
      setError(
        err instanceof Error
          ? err.message.replace(
              /^Error invoking remote method '[^']*': (Error: )?/,
              "",
            )
          : "Deletion failed.",
      );
      setPassword("");
      passwordRef.current?.focus();
    } finally {
      setIsDeleting(false);
    }
  };

  const finish = () => {
    clearLocalTraces(Boolean(result?.lastProfile));
    deleteProfileDialog.close();
    logout();
    navigate(result?.lastProfile ? "/setup" : "/profiles");
    window.location.reload();
  };

  if (!open) return null;

  const others = summary ? summary.otherProfiles > 0 : false;
  const outlined =
    "rounded-lg border border-border-light dark:border-border-dark px-4 py-2 text-sm font-medium text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus:ring-2 focus:ring-info disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 pt-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !result) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-profile-title"
        onKeyDown={onKeyDown}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark p-6 text-text-light dark:text-text-dark shadow-xl"
      >
        {result ? (
          <div className="text-center" role="status">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-success" />
            <h2
              id="delete-profile-title"
              className="font-display text-xl font-bold"
            >
              Your profile was deleted
            </h2>
            <p className="mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
              Your entries, photos, recordings, goals, chats and settings are
              gone from this computer
              {result.backupsRemoved
                ? ", along with the database safety copies"
                : ""}
              .
              {!result.lastProfile
                ? " The older database safety copies were replaced by a new one made after your profile was removed, so they no longer hold it."
                : ""}
              {result.filesPending
                ? ` ${result.filesPending} file${result.filesPending === 1 ? " is" : "s are"} in use by another program and will be removed the next time MindSage starts.`
                : ""}
            </p>
            <button
              onClick={finish}
              className="mt-6 w-full rounded-lg bg-danger px-5 py-2.5 font-medium text-white focus:outline-none focus:ring-2 focus:ring-info"
            >
              {result.lastProfile ? "Start fresh" : "Choose a profile"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 id="delete-profile-title" className="text-lg font-semibold">
                Delete {name}&apos;s profile?
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                disabled={isDeleting}
                className="rounded-lg p-1.5 hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus:ring-2 focus:ring-info"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <section aria-label="What will be deleted" className="mt-4">
              <p className="text-sm font-semibold">
                This removes from this PC:
              </p>
              {summary ? (
                <ul className="mt-2 space-y-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                  <li className="flex gap-2">
                    <X size={14} className="mt-1 shrink-0" aria-hidden />
                    <span>
                      The journal:{" "}
                      {plural(
                        summary.entries + summary.trashedEntries,
                        "entry",
                        "entries",
                      )}
                      , {plural(summary.photos, "photo")},{" "}
                      {plural(summary.recordings, "voice note")} and{" "}
                      {plural(summary.chats, "Ask conversation")}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <X size={14} className="mt-1 shrink-0" aria-hidden />
                    <span>
                      {plural(summary.goals + summary.trashedGoals, "goal")} and
                      their progress
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <X size={14} className="mt-1 shrink-0" aria-hidden />
                    <span>The media folder and the search index</span>
                  </li>
                  {!others && (
                    <li className="flex gap-2">
                      <X size={14} className="mt-1 shrink-0" aria-hidden />
                      <span>
                        The database safety copies made before app updates (this
                        is the last profile here)
                      </span>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                  {error || "Reading your profile…"}
                </p>
              )}

              <p className="mt-4 text-sm font-semibold">Not removed:</p>
              <ul className="mt-2 space-y-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                <li className="flex gap-2">
                  <Check size={14} className="mt-1 shrink-0" aria-hidden />
                  <span>
                    Exports and backups you saved elsewhere
                    {backupPath ? `, like ${backupPath}` : ""}
                  </span>
                </li>
                {others && (
                  <li className="flex gap-2">
                    <Check size={14} className="mt-1 shrink-0" aria-hidden />
                    <span>
                      The database safety copies are replaced by one new copy
                      made after the delete, because they also protect the other
                      profiles on this PC
                    </span>
                  </li>
                )}
              </ul>
              <p className="mt-4 text-sm text-text-light-sub dark:text-text-dark-sub">
                Files are deleted the normal Windows way. Recovery tools can
                sometimes bring deleted files back until the space is reused.
              </p>
            </section>

            <label
              htmlFor="delete-profile-password"
              className="mt-5 block text-sm font-medium"
            >
              Enter {name}&apos;s password to confirm
            </label>
            <input
              ref={passwordRef}
              id="delete-profile-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              disabled={isDeleting}
              className={`mt-2 w-full rounded-lg border bg-tertiary-light p-2.5 outline-none focus:ring-2 focus:ring-info dark:bg-tertiary-dark ${
                error && summary
                  ? "border-danger"
                  : "border-border-light dark:border-border-dark"
              }`}
            />
            {error && summary && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={isDeleting}
                className={outlined}
              >
                Keep my profile
              </button>
              <HoldButton
                label="Hold to delete"
                holdingLabel="Keep holding…"
                onComplete={deleteNow}
                disabled={isDeleting || !password || !summary}
              />
            </div>
            <p className="mt-2 text-right text-xs text-text-light-sub dark:text-text-dark-sub">
              {isDeleting ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  Deleting…
                </span>
              ) : (
                "Hold for a moment. Enter works too."
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
