import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileUp,
  Loader2,
  Undo2,
} from "lucide-react";
import {
  portabilityService,
  type ExportFormat,
  type ImportPreview,
} from "../../api/portabilityService";

interface FormatOption {
  id: ExportFormat;
  name: string;
  opensIn: string;
  includes: string;
}

// What each format is for, in the words someone choosing between them needs.
const FORMATS: FormatOption[] = [
  {
    id: "markdown",
    name: "Markdown",
    opensIn: "Obsidian, Logseq, Joplin, Bear, Notion, Standard Notes",
    includes:
      "One file per entry with title, date, mood and tags; photos and voice notes alongside.",
  },
  {
    id: "dayone",
    name: "Day One",
    opensIn: "Day One (every platform), Journey",
    includes: "Text, dates, tags and photos. Voice notes are left out.",
  },
  {
    id: "csv",
    name: "Spreadsheet (CSV)",
    opensIn: "Excel, Google Sheets, Numbers, Notion databases",
    includes:
      "One row per entry with date, title, text, mood and tags. No media.",
  },
  {
    id: "enex",
    name: "Evernote",
    opensIn: "Evernote, Joplin, UpNote, Notesnook",
    includes:
      "Text, dates and tags, with photos and voice notes inside the file.",
  },
  {
    id: "text",
    name: "Plain text",
    opensIn: "Anything",
    includes: "Every entry in one readable file, oldest first. No media.",
  },
  {
    id: "mindsage",
    name: "MindSage backup",
    opensIn: "MindSage",
    includes: "Everything: entries, media, goals, chats and settings.",
  },
];

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

const card =
  "bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark";
const primaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors disabled:opacity-50";

function ExportPanel() {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const run = async () => {
    setResult(null);
    const dest = await portabilityService.pickExportPath(format);
    if (!dest) return;
    setBusy(true);
    try {
      const r = await portabilityService.exportJournal(format, dest);
      const parts = [
        r.count !== undefined
          ? `Exported ${r.count} ${r.count === 1 ? "entry" : "entries"}`
          : "Exported",
        `to ${dest}.`,
      ];
      if (r.missingMedia) {
        parts.push(
          `${r.missingMedia} photo or recording files were missing on disk and were left out.`,
        );
      }
      setResult({ ok: true, text: parts.join(" ") });
    } catch (err) {
      setResult({
        ok: false,
        text: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={card}>
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
          Export
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Take your journal anywhere. Pick the format the other app reads.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div
          role="radiogroup"
          aria-label="Export format"
          className="grid gap-2"
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
                className={`text-left rounded-xl border p-3 transition-colors ${
                  selected
                    ? "border-info bg-tertiary-light dark:bg-tertiary-dark"
                    : "border-border-light dark:border-border-dark hover:bg-tertiary-light/60 dark:hover:bg-tertiary-dark/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-text-light dark:text-text-dark">
                    {f.name}
                  </span>
                  {selected && (
                    <Check size={16} className="text-info shrink-0" />
                  )}
                </div>
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-0.5">
                  Opens in: {f.opensIn}
                </p>
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                  {f.includes}
                </p>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-3">
          {result && (
            <p
              role="status"
              className={`text-sm mr-auto ${result.ok ? "text-text-light-sub dark:text-text-dark-sub" : "text-danger"}`}
            >
              {result.text}
            </p>
          )}
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className={primaryBtn}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {busy ? "Exporting" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPanel() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"reading" | "importing" | "undoing" | null>(
    null,
  );
  const [done, setDone] = useState<{ imported: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const errorText = (err: unknown) =>
    (err instanceof Error ? err.message : String(err)).replace(
      /^Error invoking remote method '[^']+': (Error: )?/,
      "",
    );

  const pick = async () => {
    setMessage(null);
    setDone(null);
    setBusy("reading");
    try {
      const p = await portabilityService.pickImport();
      setPreview(p.canceled ? null : p);
    } catch (err) {
      setMessage({ ok: false, text: `Couldn't read that: ${errorText(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const [dragging, setDragging] = useState(false);

  const readDropped = async (files: FileList) => {
    const paths = Array.from(files)
      .map((f) => window.electron.getPathForFile(f))
      .filter(Boolean);
    if (!paths.length) return;
    setMessage(null);
    setDone(null);
    setBusy("reading");
    try {
      setPreview(await portabilityService.readImport(paths));
    } catch (err) {
      setMessage({ ok: false, text: `Couldn't read that: ${errorText(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    setBusy("importing");
    try {
      const r = await portabilityService.commitImport();
      setDone(r);
      setPreview(null);
    } catch (err) {
      setMessage({ ok: false, text: `Import failed: ${errorText(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    setBusy("undoing");
    try {
      const r = await portabilityService.undoImport();
      setDone(null);
      setMessage({
        ok: true,
        text: `Removed the ${r.removed} imported entries.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: `Undo failed: ${errorText(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const p = preview;
  return (
    <div className={card}>
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
          Import
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Bring in entries from another journal. You'll see what was found
          before anything is added.
        </p>
      </div>
      <div
        className={`p-6 space-y-4 rounded-b-2xl transition-colors ${dragging ? "bg-info/10 outline-2 outline-dashed outline-info -outline-offset-8" : ""}`}
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
          if (busy === null) void readDropped(e.dataTransfer.files);
        }}
      >
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Reads exports from Day One, Journey, Daylio, Evernote, Obsidian and
          other Markdown apps, any CSV with a date and text column, plain text
          files, and MindSage backups. Entries already in your journal are
          skipped.
        </p>

        {p && (
          <div className="rounded-xl border border-border-light dark:border-border-dark p-4 space-y-2">
            {p.format ? (
              <>
                <p className="font-medium text-text-light dark:text-text-dark">
                  {p.formatName} export: {p.toImport}{" "}
                  {p.toImport === 1 ? "entry" : "entries"} to import
                </p>
                <ul className="text-sm text-text-light-sub dark:text-text-dark-sub space-y-0.5">
                  {p.from && (
                    <li>
                      {fmtDate(p.from) === fmtDate(p.to)
                        ? `On ${fmtDate(p.from)}`
                        : `From ${fmtDate(p.from)} to ${fmtDate(p.to)}`}
                    </li>
                  )}
                  {!!p.duplicates && (
                    <li>{p.duplicates} already in your journal, skipped</li>
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
                      {p.extraMedia} extra photos or recordings won't be kept:
                      MindSage holds one of each per entry
                    </li>
                  )}
                </ul>
              </>
            ) : null}
            {!!p.warnings?.length && (
              <details className="text-sm">
                <summary className="cursor-pointer text-warning flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  {p.format
                    ? `${p.warnings.length + (p.moreWarnings ?? 0)} things to know`
                    : p.warnings[0]}
                </summary>
                {p.format && (
                  <ul className="mt-2 list-disc pl-5 text-text-light-sub dark:text-text-dark-sub space-y-0.5">
                    {p.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {!!p.moreWarnings && <li>and {p.moreWarnings} more</li>}
                  </ul>
                )}
              </details>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className={secondaryBtn}
              >
                Cancel
              </button>
              {!!p.toImport && (
                <button
                  type="button"
                  onClick={commit}
                  disabled={busy !== null}
                  className={primaryBtn}
                >
                  {busy === "importing" && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  Import {p.toImport} {p.toImport === 1 ? "entry" : "entries"}
                </button>
              )}
            </div>
          </div>
        )}

        {done && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-success/10 border border-success/20 p-3">
            <p
              role="status"
              className="text-sm text-text-light dark:text-text-dark"
            >
              Imported {done.imported}{" "}
              {done.imported === 1 ? "entry" : "entries"}. They'll become
              searchable over the next few minutes.
            </p>
            <button
              type="button"
              onClick={undo}
              disabled={busy !== null}
              className={secondaryBtn}
            >
              {busy === "undoing" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Undo2 size={16} />
              )}
              Undo
            </button>
          </div>
        )}

        {message && (
          <p
            role="status"
            className={`text-sm ${message.ok ? "text-text-light-sub dark:text-text-dark-sub" : "text-danger"}`}
          >
            {message.text}
          </p>
        )}

        {!p && (
          <div className="flex items-center justify-end gap-3">
            <span className="mr-auto text-xs text-text-light-sub dark:text-text-dark-sub">
              {dragging ? "Drop to read" : "Or drop the export files here"}
            </span>
            <button
              type="button"
              onClick={pick}
              disabled={busy !== null}
              className={primaryBtn}
            >
              {busy === "reading" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileUp size={16} />
              )}
              {busy === "reading" ? "Reading" : "Choose files"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const ExportSettings = () => (
  <div className="space-y-6">
    <ExportPanel />
    <ImportPanel />
  </div>
);

export default ExportSettings;
