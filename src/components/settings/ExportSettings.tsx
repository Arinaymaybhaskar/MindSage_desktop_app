import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileUp,
  Loader2,
  Undo2,
  Upload,
} from "lucide-react";
import Modal from "../Modal";
import { AppLogoRow, type AppId } from "./AppLogo";
import {
  portabilityService,
  type ExportFormat,
  type ImportPreview,
} from "../../api/portabilityService";

interface FormatOption {
  id: ExportFormat;
  name: string;
  apps: AppId[];
  opensIn: string;
  includes: string;
}

// What each format is for, in the words someone choosing between them needs.
const FORMATS: FormatOption[] = [
  {
    id: "markdown",
    name: "Markdown",
    apps: ["obsidian", "logseq", "joplin", "notion", "bear"],
    opensIn: "Obsidian, Logseq, Joplin, Notion, Bear",
    includes:
      "One file per entry with title, date, mood and tags; photos and voice notes alongside.",
  },
  {
    id: "dayone",
    name: "Day One",
    apps: ["dayone", "journey"],
    opensIn: "Day One on every platform, Journey",
    includes: "Text, dates, tags and photos. Voice notes are left out.",
  },
  {
    id: "enex",
    name: "Evernote",
    apps: ["evernote", "joplin", "notesnook"],
    opensIn: "Evernote, Joplin, Notesnook, UpNote",
    includes:
      "Text, dates and tags, with photos and voice notes inside the file.",
  },
  {
    id: "csv",
    name: "Spreadsheet",
    apps: ["excel", "sheets", "libreoffice", "notion"],
    opensIn: "Excel, Google Sheets, LibreOffice, Notion databases",
    includes:
      "One row per entry with date, title, text, mood and tags. No media.",
  },
  {
    id: "text",
    name: "Plain text",
    apps: ["text"],
    opensIn: "Anything that opens a .txt file",
    includes: "Every entry in one readable file, oldest first. No media.",
  },
  {
    id: "mindsage",
    name: "MindSage backup",
    apps: ["mindsage"],
    opensIn: "MindSage",
    includes: "Everything: entries, media, goals, chats and settings.",
  },
];

const IMPORT_SOURCES: AppId[] = [
  "dayone",
  "journey",
  "daylio",
  "evernote",
  "obsidian",
  "notion",
  "logseq",
  "joplin",
  "markdown",
  "mindsage",
];

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

const errorText = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors disabled:opacity-50";
const sub = "text-sm text-text-light-sub dark:text-text-dark-sub";

// ---------------------------------------------------------------- export --

function ExportModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const close = () => {
    if (busy) return;
    setFormat(null);
    setResult(null);
    onClose();
  };

  const chosen = FORMATS.find((f) => f.id === format);

  const run = async () => {
    if (!format) return;
    const dest = await portabilityService.pickExportPath(format);
    if (!dest) return;
    setBusy(true);
    try {
      const r = await portabilityService.exportJournal(format, dest);
      const parts = [
        r.count !== undefined
          ? `${plural(r.count, "entry", "entries")} saved`
          : "Saved",
        `to ${dest}.`,
      ];
      if (r.missingMedia) {
        parts.push(
          `${plural(r.missingMedia, "photo or recording was", "photos or recordings were")} missing on disk and left out.`,
        );
      }
      setResult({ ok: true, text: parts.join(" ") });
    } catch (err) {
      setResult({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Export data" size="lg">
      {result ? (
        <div className="flex flex-col items-center text-center gap-4 py-6">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${result.ok ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}
          >
            {result.ok ? <Check size={28} /> : <AlertTriangle size={26} />}
          </div>
          <div>
            <p className="font-medium">
              {result.ok ? `Exported as ${chosen?.name}` : "Export failed"}
            </p>
            <p className={`${sub} mt-1 break-all`}>{result.text}</p>
          </div>
          <div className="flex gap-2">
            {!result.ok && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className={secondaryBtn}
              >
                Try again
              </button>
            )}
            <button type="button" onClick={close} className={primaryBtn}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className={sub}>
            Choose the format the app you're moving to reads.
          </p>
          <div
            role="radiogroup"
            aria-label="Export format"
            className="grid gap-3 sm:grid-cols-2"
          >
            {FORMATS.map((f) => {
              const selected = f.id === format;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFormat(f.id)}
                  className={`relative flex flex-col gap-2 text-left rounded-xl border p-4 transition-colors ${
                    selected
                      ? "border-info ring-1 ring-info bg-tertiary-light dark:bg-tertiary-dark"
                      : "border-border-light dark:border-border-dark hover:bg-tertiary-light/60 dark:hover:bg-tertiary-dark/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{f.name}</span>
                    {selected && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-info text-white">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <AppLogoRow ids={f.apps} />
                  <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                    <span className="font-medium text-text-light dark:text-text-dark">
                      Opens in{" "}
                    </span>
                    {f.opensIn}
                  </p>
                  <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                    {f.includes}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="sticky -bottom-6 sm:-bottom-8 -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 px-6 sm:px-8 py-4 flex justify-end gap-2 border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
            <button type="button" onClick={close} className={secondaryBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={run}
              disabled={!format || busy}
              className={primaryBtn}
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {busy
                ? "Exporting"
                : chosen
                  ? `Export as ${chosen.name}`
                  : "Choose a format"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- import --

type ImportStage = "drop" | "reading" | "preview" | "importing" | "done";

function ImportModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<ImportStage>("drop");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState(0);
  const [undone, setUndone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setStage("drop");
    setPreview(null);
    setError(null);
    setUndone(null);
  };
  const busy = stage === "reading" || stage === "importing";
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const read = async (load: () => Promise<ImportPreview>) => {
    setError(null);
    setStage("reading");
    try {
      const p = await load();
      if (p.canceled) {
        setStage("drop");
        return;
      }
      setPreview(p);
      setStage("preview");
    } catch (err) {
      setError(`Couldn't read that: ${errorText(err)}`);
      setStage("drop");
    }
  };

  const onDrop = (files: FileList) => {
    const paths = Array.from(files)
      .map((f) => window.electron.getPathForFile(f))
      .filter(Boolean);
    if (paths.length) void read(() => portabilityService.readImport(paths));
  };

  const commit = async () => {
    setStage("importing");
    try {
      const r = await portabilityService.commitImport();
      setImported(r.imported);
      setStage("done");
    } catch (err) {
      setError(`Import failed: ${errorText(err)}`);
      setStage("preview");
    }
  };

  const undo = async () => {
    try {
      const r = await portabilityService.undoImport();
      setUndone(r.removed);
    } catch (err) {
      setError(`Undo failed: ${errorText(err)}`);
    }
  };

  const p = preview;
  return (
    <Modal isOpen={isOpen} onClose={close} title="Import data" size="lg">
      {(stage === "drop" || stage === "reading") && (
        <div className="space-y-5">
          <div
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging
                ? "border-info bg-info/10"
                : "border-border-light dark:border-border-dark bg-tertiary-light/40 dark:bg-tertiary-dark/40"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) onDrop(e.dataTransfer.files);
            }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-light dark:bg-tertiary-dark ring-1 ring-border-light dark:ring-border-dark">
              {stage === "reading" ? (
                <Loader2 size={24} className="animate-spin text-info" />
              ) : (
                <Upload size={24} className={dragging ? "text-info" : ""} />
              )}
            </div>
            <div>
              <p className="font-semibold">
                {stage === "reading"
                  ? "Reading your export"
                  : dragging
                    ? "Drop to read it"
                    : "Drop your export here"}
              </p>
              <p className={`${sub} mt-1`}>
                A zip, .json, .csv, .md, .txt or .enex file. Nothing is added
                until you confirm.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void read(portabilityService.pickImport)}
              disabled={busy}
              className={secondaryBtn}
            >
              <FileUp size={16} />
              Browse files
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-danger"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-light-sub dark:text-text-dark-sub">
              Works with exports from
            </p>
            <AppLogoRow ids={IMPORT_SOURCES} size={30} />
            <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
              Day One, Journey, Daylio, Evernote, Obsidian, Notion, Logseq,
              Joplin, any Markdown or CSV with a date and text column, plain
              text files, and MindSage backups.
            </p>
          </div>
        </div>
      )}

      {(stage === "preview" || stage === "importing") && p && (
        <div className="space-y-5">
          {p.format ? (
            <div className="rounded-xl border border-border-light dark:border-border-dark p-5 space-y-3">
              <p className="text-lg font-semibold">
                {p.formatName} export:{" "}
                {plural(p.toImport ?? 0, "entry", "entries")} to import
              </p>
              <ul className={`${sub} space-y-1`}>
                {p.files?.length ? <li>From {p.files.join(", ")}</li> : null}
                {p.from && (
                  <li>
                    {fmtDate(p.from) === fmtDate(p.to)
                      ? `Dated ${fmtDate(p.from)}`
                      : `Dated ${fmtDate(p.from)} to ${fmtDate(p.to)}`}
                  </li>
                )}
                {!!p.duplicates && (
                  <li>
                    {plural(p.duplicates, "is", "are")} already in your journal
                    and will be skipped
                  </li>
                )}
                {!!p.withPhotos && (
                  <li>
                    {p.withPhotos === 1
                      ? "1 with a photo"
                      : `${p.withPhotos} with photos`}
                  </li>
                )}
                {!!p.withAudio && (
                  <li>
                    {p.withAudio === 1
                      ? "1 with a voice note"
                      : `${p.withAudio} with voice notes`}
                  </li>
                )}
                {!!p.extraMedia && (
                  <li>
                    {plural(
                      p.extraMedia,
                      "extra photo or recording",
                      "extra photos or recordings",
                    )}{" "}
                    won't be kept: MindSage holds one of each per entry
                  </li>
                )}
              </ul>
              {!!p.warnings?.length && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-warning inline-flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    {plural(
                      p.warnings.length + (p.moreWarnings ?? 0),
                      "thing",
                      "things",
                    )}{" "}
                    to know
                  </summary>
                  <ul className={`mt-2 list-disc pl-5 ${sub} space-y-0.5`}>
                    {p.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {!!p.moreWarnings && <li>and {p.moreWarnings} more</li>}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-danger"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {p.warnings?.[0]}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className={secondaryBtn}
            >
              <ArrowLeft size={16} />
              Choose another file
            </button>
            {!!p.toImport && (
              <button
                type="button"
                onClick={commit}
                disabled={busy}
                className={primaryBtn}
              >
                {stage === "importing" && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                Import {plural(p.toImport, "entry", "entries")}
              </button>
            )}
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="flex flex-col items-center text-center gap-4 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            {undone === null ? <Check size={28} /> : <Undo2 size={26} />}
          </div>
          <div>
            <p className="font-medium">
              {undone === null
                ? `Imported ${plural(imported, "entry", "entries")}`
                : `Removed the ${plural(undone, "imported entry", "imported entries")}`}
            </p>
            {undone === null && (
              <p className={`${sub} mt-1`}>
                They'll become searchable over the next few minutes.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            {undone === null && (
              <button type="button" onClick={undo} className={secondaryBtn}>
                <Undo2 size={16} />
                Undo
              </button>
            )}
            <button type="button" onClick={close} className={primaryBtn}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------- section --

const ExportSettings = () => {
  const [open, setOpen] = useState<"export" | "import" | null>(null);

  const tile =
    "group flex flex-col gap-3 text-left rounded-2xl border border-border-light dark:border-border-dark p-5 transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-info";
  const tileIcon =
    "flex h-11 w-11 items-center justify-center rounded-xl bg-tertiary-light dark:bg-tertiary-dark ring-1 ring-border-light dark:ring-border-dark text-text-light dark:text-text-dark transition-transform group-hover:scale-105";

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
          Import & Export
        </h2>
        <p className={`${sub} mt-1`}>
          Your journal is yours. Take it to another app, or bring one in.
        </p>
      </div>
      <div className="p-6 grid gap-4 sm:grid-cols-2 text-text-light dark:text-text-dark">
        <button
          type="button"
          className={tile}
          onClick={() => setOpen("export")}
        >
          <span className={tileIcon}>
            <Download size={20} />
          </span>
          <span>
            <span className="block font-semibold">Export data</span>
            <span className={`block ${sub} mt-0.5`}>
              Save a copy for Day One, Obsidian, Evernote, a spreadsheet, or a
              full backup.
            </span>
          </span>
          <AppLogoRow
            ids={["dayone", "obsidian", "notion", "evernote", "sheets"]}
            size={20}
          />
        </button>
        <button
          type="button"
          className={tile}
          onClick={() => setOpen("import")}
        >
          <span className={tileIcon}>
            <Upload size={20} />
          </span>
          <span>
            <span className="block font-semibold">Import data</span>
            <span className={`block ${sub} mt-0.5`}>
              Bring in entries from another journal. You'll see what was found
              first.
            </span>
          </span>
          <AppLogoRow
            ids={["dayone", "journey", "daylio", "obsidian", "evernote"]}
            size={20}
          />
        </button>
      </div>
      <ExportModal isOpen={open === "export"} onClose={() => setOpen(null)} />
      <ImportModal isOpen={open === "import"} onClose={() => setOpen(null)} />
    </div>
  );
};

export default ExportSettings;
