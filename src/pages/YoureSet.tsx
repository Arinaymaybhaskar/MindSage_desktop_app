import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { aiFeaturesService } from "../api/aiFeaturesService";
import { helloAvailable } from "../api/helloService";
import {
  errorText,
  portabilityService,
  type ImportPreview,
} from "../api/portabilityService";
import { userService } from "../api/userService";

const SAVE_FAILED = "Could not save that. Please try again.";

type ImportStage = "idle" | "reading" | "preview" | "importing" | "done";

/**
 * Optional import line (KAN-80, KAN-436): bring a journal from another app.
 * The import runs in the main process; Continue never waits for it, and its
 * progress shows in the Local AI panel.
 */
function ImportLine() {
  const [stage, setStage] = useState<ImportStage>("idle");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const read = async (load: () => Promise<ImportPreview>) => {
    setError(null);
    setStage("reading");
    try {
      const p = await load();
      // An unsupported file comes back with no format and the supported list.
      if (!p.canceled && !p.format)
        setError(p.warnings?.[0] ?? "MindSage can't read that file.");
      if (p.canceled || !p.format) return setStage("idle");
      setPreview(p);
      setStage("preview");
    } catch (err) {
      setError(`Couldn't read that: ${errorText(err)}`);
      setStage("idle");
    }
  };

  const commit = () => {
    setStage("importing");
    portabilityService.commitImport().then(
      (r) => {
        setImported(r.imported);
        setStage("done");
      },
      (err) => {
        setError(`Import stopped: ${errorText(err)}`);
        setStage("idle");
      },
    );
  };

  const onDrop = (files: FileList) => {
    const paths = Array.from(files)
      .map((f) => window.electron.getPathForFile(f))
      .filter(Boolean);
    if (paths.length) void read(() => portabilityService.readImport(paths));
  };

  const busy = stage === "reading" || stage === "importing";
  const btn =
    "inline-flex items-center gap-2 rounded-lg bg-dark1 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-light1 dark:text-dark1";

  return (
    <div className="mt-6 border-t border-border-light pt-4 dark:border-border-dark">
      <p>
        Have entries elsewhere? Optional: bring them from Day One, Journey,
        Daylio, Evernote, Obsidian, Notion, Markdown, CSV, plain text or a
        MindSage backup.
      </p>
      <div
        className="mt-3 space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy && stage !== "done") onDrop(e.dataTransfer.files);
        }}
      >
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {(stage === "idle" || stage === "reading") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void read(portabilityService.pickImport)}
            className={btn}
          >
            <FileUp size={15} />
            {stage === "reading" ? "Reading…" : "Choose a file or drop it here"}
          </button>
        )}
        {stage === "preview" && preview && (
          <>
            <p className="text-sm text-text-light dark:text-text-dark">
              {preview.formatName} export: {preview.toImport ?? 0} entries to
              import
              {preview.duplicates ? `, ${preview.duplicates} already here` : ""}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={commit} className={btn}>
                Import
              </button>
              <button
                type="button"
                onClick={() => setStage("idle")}
                className="rounded-lg border border-border-light px-4 py-2 text-sm font-semibold text-text-light-sub dark:border-border-dark dark:text-text-dark-sub"
              >
                Choose another file
              </button>
            </div>
          </>
        )}
        {stage === "importing" && (
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
            Importing {preview?.toImport ?? 0} {preview?.formatName} entries in
            the background. You can continue now; the Local AI panel shows how
            far it has got.
          </p>
        )}
        {stage === "done" && (
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
            Imported {imported} entries. The newest get titles and summaries
            once the local AI is ready.
          </p>
        )}
      </div>
    </div>
  );
}

/** Last setup screen (KAN-81). Each toggle saves the moment it changes. */
export default function YoureSet() {
  const navigate = useNavigate();
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState("20:00");
  const [suggestions, setSuggestions] = useState(true);
  const [hello, setHello] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    userService
      .getSettings()
      .then((s) => {
        setReminder(!!s.journal_reminder);
        setTime(s.reminder_time || "20:00");
      })
      .catch(() => {});
    aiFeaturesService
      .get()
      .then((f) => f && setSuggestions(f.suggestions))
      .catch(() => {});
    helloAvailable().then(setHello);
  }, []);

  const saveReminder = (patch: {
    journal_reminder?: boolean;
    reminder_time?: string;
  }) =>
    userService
      .updateSettings(patch)
      .then(() => setError(""))
      .catch(() => setError(SAVE_FAILED));

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold">You're set</h1>
      <p className="mt-2 text-sm">Change any of this later in Settings.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <label className="mt-6 flex items-center gap-3">
        <input
          type="checkbox"
          checked={reminder}
          onChange={(e) => {
            setReminder(e.target.checked);
            void saveReminder({ journal_reminder: e.target.checked });
          }}
        />
        Remind me to write each day
      </label>
      {reminder && (
        <label className="mt-3 flex items-center gap-3">
          Reminder time
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (e.target.value)
                void saveReminder({ reminder_time: e.target.value });
            }}
          />
        </label>
      )}

      <label className="mt-4 flex items-center gap-3">
        <input
          type="checkbox"
          checked={suggestions}
          onChange={(e) => {
            setSuggestions(e.target.checked);
            aiFeaturesService
              .set("suggestions", e.target.checked)
              .catch(() => setError(SAVE_FAILED));
          }}
        />
        Suggest prompts and ideas while I write
      </label>

      {hello && (
        <label className="mt-4 flex items-center gap-3">
          <input type="checkbox" />
          Unlock with Windows Hello
        </label>
      )}

      <ImportLine />

      <button
        type="button"
        onClick={() => navigate("/", { replace: true })}
        className="mt-8 rounded-lg bg-dark1 px-6 py-2.5 font-semibold text-white dark:bg-light1 dark:text-dark1"
      >
        Continue
      </button>
    </div>
  );
}
