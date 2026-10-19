import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { portabilityService } from "../../api/portabilityService";
import { deleteProfileDialog } from "../../utils/deleteProfileDialog";

type Backup =
  | { state: "none" }
  | { state: "saving" }
  | { state: "saved"; count?: number; path: string }
  | { state: "skipped" }
  | { state: "failed"; message: string };

/**
 * The Delete profile card on Settings, Profile. It offers a backup first; a
 * backup that fails blocks deleting until it works or the person chooses to
 * go on without one. The dialog it opens does the rest.
 */
export default function DeleteProfileCard({ name }: { name: string }) {
  const [backup, setBackup] = useState<Backup>({ state: "none" });

  const makeBackup = async () => {
    setBackup({ state: "saving" });
    try {
      const filePath = await portabilityService.pickExportPath("mindsage");
      if (!filePath) {
        setBackup({ state: "none" }); // cancelled the save dialog
        return;
      }
      const r = await portabilityService.exportJournal("mindsage", filePath);
      if (!r?.success) throw new Error("The backup could not be written.");
      setBackup({ state: "saved", count: r.count, path: filePath });
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

  const blocked = backup.state === "failed" || backup.state === "saving";
  const neutral =
    "inline-flex items-center gap-2 rounded-lg border border-border-light dark:border-border-dark px-4 py-2 text-sm font-medium text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark disabled:opacity-50";

  return (
    <section
      aria-labelledby="delete-profile-heading"
      className="mt-6 rounded-2xl border border-danger/30 bg-danger/5 p-6"
    >
      <h3
        id="delete-profile-heading"
        className="font-display text-lg font-semibold text-text-light dark:text-text-dark"
      >
        Delete profile
      </h3>
      <p className="mt-1 text-sm text-text-light-sub dark:text-text-dark-sub">
        Removes {name || "this"}&apos;s journal, photos, voice notes, goals and
        Ask conversations from this PC. This can&apos;t be undone, so make a
        backup first if you might want it back. A backup holds your entries and
        their media, not goals, chats or the Trash.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={makeBackup}
          disabled={backup.state === "saving"}
          className={neutral}
        >
          {backup.state === "saving" ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Save size={16} aria-hidden />
          )}
          {backup.state === "saved"
            ? "Make another backup"
            : "Make a backup first"}
        </button>
        <button
          type="button"
          onClick={() =>
            deleteProfileDialog.open(
              name,
              backup.state === "saved" ? backup.path : null,
            )
          }
          disabled={blocked}
          className="rounded-lg border border-danger/60 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          Delete profile…
        </button>
      </div>
      {backup.state === "saved" && (
        <p className="mt-3 text-sm text-success" role="status">
          Backup saved
          {backup.count !== undefined
            ? ` (${backup.count} ${backup.count === 1 ? "entry" : "entries"})`
            : ""}
          .
        </p>
      )}
      {backup.state === "failed" && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {backup.message} Nothing has been deleted. Try again, pick another
          place (a full disk is a common cause), or{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setBackup({ state: "skipped" })}
          >
            go on without a backup
          </button>
          .
        </p>
      )}
    </section>
  );
}
