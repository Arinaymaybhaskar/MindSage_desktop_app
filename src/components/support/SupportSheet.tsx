import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Smartphone, X } from "lucide-react";
import QrCode from "./QrCode";
import { useToast } from "../../hooks/useToast";
import {
  INTERNATIONAL_HELP,
  SUPPORT_REGIONS,
  VERIFIED_ON,
  regionByCode,
  type RegionCode,
  type SupportLine,
} from "../../data/supportLines";
import { getSupportRegion, setSupportRegion } from "../../utils/supportRegion";

interface SupportSheetProps {
  open: boolean;
  onClose: () => void;
}

type Shown = { line: SupportLine; mode: "call" | "text" } | null;

const OTHER = "OTHER";

/**
 * People to talk to, by country (KAN-54, KAN-55). Everything is bundled, so it
 * works offline. A desktop cannot place a call, so a number is shown to read,
 * copy, or open on a phone through a QR code made on this computer.
 */
export default function SupportSheet({ open, onClose }: SupportSheetProps) {
  const { showToast } = useToast();
  const [region, setRegion] = useState<RegionCode | null>(null);
  const [chosenOther, setChosenOther] = useState(false);
  const [shown, setShown] = useState<Shown>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const numberRef = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);

  // Each time it opens: start from the saved or system region.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    setRegion(getSupportRegion());
    setChosenOther(false);
    setShown(null);
    return () => {
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const data = regionByCode(region);
  const needsPicker = !data;

  // Focus lands on the first line (or the country picker when there is none).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () => (firstAction.current ?? picker.current)?.focus(),
      0,
    );
    return () => clearTimeout(t);
  }, [open, region, chosenOther]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button, select, a[href], [tabindex]:not([tabindex='-1'])",
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
    },
    [onClose],
  );

  const copy = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      showToast(`Copied ${number}`, "success");
    } catch {
      // Clipboard blocked: select the number so Ctrl+C works.
      const el = numberRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      showToast("Copy was blocked. The number is selected; press Ctrl+C.");
    }
  };

  if (!open) return null;

  const lines = data?.lines ?? [];
  const general = lines.filter((l) => l.audience === "everyone");
  const young = lines.filter((l) => l.audience === "under18");
  let firstAssigned = false;
  const takeFirst = () => {
    if (firstAssigned) return undefined;
    firstAssigned = true;
    return firstAction;
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-border-light dark:border-border-dark bg-tertiary-light dark:bg-tertiary-dark px-3 py-1.5 text-xs font-semibold text-text-light dark:text-text-dark hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-info";

  const lineRow = (line: SupportLine) => {
    const rows: {
      mode: "call" | "text";
      label: string;
      number: string;
      uri: string;
    }[] = [];
    if (line.voice && line.voiceDial)
      rows.push({
        mode: "call",
        label: "Call",
        number: line.voice,
        uri: `tel:${line.voiceDial}`,
      });
    if (line.text)
      rows.push({
        mode: "text",
        label: "Text",
        number: line.text,
        uri: `sms:${line.text.replace(/\s+/g, "")}`,
      });
    return (
      <li
        key={line.id}
        className="rounded-xl border border-border-light dark:border-border-dark p-3"
      >
        <p className="font-semibold text-text-light dark:text-text-dark">
          {line.name}
        </p>
        <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
          {line.hours}
        </p>
        {line.note && (
          <p className="mt-1 text-xs text-text-light-sub dark:text-text-dark-sub">
            {line.note}
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li
              key={r.mode}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm text-text-light dark:text-text-dark">
                {r.label}{" "}
                <span className="font-semibold tabular-nums">{r.number}</span>
              </span>
              <span className="flex gap-2">
                <button
                  ref={takeFirst()}
                  type="button"
                  className={btn}
                  onClick={() => setShown({ line, mode: r.mode })}
                >
                  <Smartphone size={14} aria-hidden />
                  Show on my phone
                  <span className="sr-only">
                    {` to ${r.label.toLowerCase()} ${r.number}`}
                  </span>
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => copy(r.number)}
                >
                  <Copy size={14} aria-hidden />
                  Copy number
                  <span className="sr-only">{` ${r.number}`}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      </li>
    );
  };

  const shownRow = shown && {
    number:
      shown.mode === "call"
        ? (shown.line.voice ?? "")
        : (shown.line.text ?? ""),
    uri:
      shown.mode === "call"
        ? `tel:${shown.line.voiceDial}`
        : `sms:${(shown.line.text ?? "").replace(/\s+/g, "")}`,
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 pt-12"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        onKeyDown={onKeyDown}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark p-5 shadow-xl text-text-light dark:text-text-dark"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="support-title" className="font-display text-xl font-bold">
              Talk to someone
            </h2>
            <p className="mt-1 text-sm text-text-light-sub dark:text-text-dark-sub">
              You do not have to go through this alone. These lines are free and
              work without MindSage being online.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={btn}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="support-region" className="text-sm font-medium">
            Where are you?
          </label>
          <select
            id="support-region"
            ref={picker}
            value={chosenOther ? OTHER : (region ?? "")}
            onChange={(e) => {
              setShown(null);
              if (e.target.value === OTHER) {
                setChosenOther(true);
                setRegion(null);
                setSupportRegion(null);
              } else {
                setChosenOther(false);
                const code = e.target.value as RegionCode;
                setRegion(code);
                setSupportRegion(code);
              }
            }}
            className="mt-1 w-full rounded-lg border border-border-light dark:border-border-dark bg-tertiary-light dark:bg-tertiary-dark p-2 text-sm"
          >
            <option value="" disabled>
              Choose a country
            </option>
            {SUPPORT_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
            <option value={OTHER}>Somewhere else</option>
          </select>
        </div>

        {needsPicker ? (
          <p className="mt-4 text-sm">
            {chosenOther ? (
              <>
                {INTERNATIONAL_HELP.text}{" "}
                <a
                  href={INTERNATIONAL_HELP.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  findahelpline.com
                </a>
              </>
            ) : (
              "Choose your country to see the lines near you."
            )}
          </p>
        ) : (
          <>
            <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm">
              In danger right now? Call the emergency number:{" "}
              <strong className="tabular-nums">{data.emergency}</strong>
            </p>
            <ul className="mt-4 space-y-3">{general.map(lineRow)}</ul>
            {young.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold">
                  If you are under 18
                </h3>
                <ul className="mt-2 space-y-3">{young.map(lineRow)}</ul>
              </>
            )}
          </>
        )}

        {shown && shownRow && (
          <div
            className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-border-light dark:border-border-dark p-4"
            role="region"
            aria-label={`Open ${shown.line.name} on your phone`}
          >
            <QrCode
              value={shownRow.uri}
              label={`${shown.mode === "call" ? "Call" : "Text"} ${shownRow.number}`}
            />
            <p className="text-sm">
              Scan with your phone&apos;s camera to{" "}
              {shown.mode === "call" ? "call" : "text"}
            </p>
            <strong
              ref={numberRef}
              className="select-all text-2xl tabular-nums"
              data-testid="support-number"
            >
              {shownRow.number}
            </strong>
          </div>
        )}

        <p className="mt-5 text-xs text-text-light-sub dark:text-text-dark-sub">
          Numbers last checked {VERIFIED_ON}. MindSage is not a crisis service.
        </p>
      </div>
    </div>
  );
}
