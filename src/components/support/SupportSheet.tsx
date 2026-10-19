import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Globe,
  Lock,
  Smartphone,
  User,
  X,
} from "lucide-react";
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
import {
  getSupportRegion,
  hasChosenSupportRegion,
  setSupportRegion,
} from "../../utils/supportRegion";

interface SupportSheetProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "call" | "text";
type Shown = { id: string; mode: Mode } | null;

interface Way {
  mode: Mode;
  label: string;
  number: string;
  uri: string;
}

const waysOf = (line: SupportLine): Way[] => {
  const ways: Way[] = [];
  if (line.voice && line.voiceDial)
    ways.push({
      mode: "call",
      label: "Call",
      number: line.voice,
      uri: `tel:${line.voiceDial}`,
    });
  if (line.text)
    ways.push({
      mode: "text",
      label: "Text",
      number: line.text,
      uri: `sms:${line.text.replace(/\s+/g, "")}`,
    });
  return ways;
};

/**
 * People to talk to, by country (KAN-54, KAN-55). Everything is bundled, so it
 * works offline. A desktop cannot dial, so a number is shown to read, copy, or
 * open on a phone through a QR code made on this computer, right under the
 * line it belongs to.
 */
export default function SupportSheet({ open, onClose }: SupportSheetProps) {
  const { showToast } = useToast();
  const [region, setRegion] = useState<RegionCode | null>(null);
  const [chosen, setChosen] = useState(false);
  const [others, setOthers] = useState(false);
  const [somewhereElse, setSomewhereElse] = useState(false);
  const [shown, setShown] = useState<Shown>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const othersToggle = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  // Each time it opens: start from the saved or system region.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const r = getSupportRegion();
    setRegion(r);
    setChosen(hasChosenSupportRegion());
    setOthers(false);
    setSomewhereElse(false);
    setShown(null);
    return () => {
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const data = regionByCode(region);

  // Focus lands on the first line (or on the country list when there is none).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () => (firstAction.current ?? othersToggle.current)?.focus(),
      0,
    );
    return () => clearTimeout(t);
  }, [open, region]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
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

  const copy = async (number: string, holder: HTMLElement | null) => {
    try {
      await navigator.clipboard.writeText(number);
      showToast(`Copied ${number}`, "success");
    } catch {
      // Clipboard blocked: select the number so Ctrl+C works.
      // Always rendered next to the buttons, so it works with the QR panel
      // closed too.
      const el = holder?.querySelector<HTMLElement>("[data-copy-number]");
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

  const choose = (code: RegionCode) => {
    setRegion(code);
    setChosen(true);
    setSupportRegion(code);
    setSomewhereElse(false);
    setOthers(false);
    setShown(null);
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
    "inline-flex items-center gap-1.5 rounded-lg border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark px-3 py-1.5 text-sm font-medium text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus:ring-2 focus:ring-info";
  const pressed = "ring-2 ring-light1 dark:ring-dark1";

  const buttons = (line: SupportLine, way: Way, ref?: typeof firstAction) => {
    const isShown = shown?.id === line.id && shown.mode === way.mode;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="sr-only" data-copy-number>
          {way.number}
        </span>
        <button
          type="button"
          className={btn}
          onClick={(e) => copy(way.number, e.currentTarget.parentElement)}
          aria-label={`Copy number ${way.number}`}
        >
          <Copy size={14} aria-hidden /> Copy number
        </button>
        <button
          ref={ref}
          type="button"
          className={`${btn} ${isShown ? pressed : ""}`}
          aria-expanded={isShown}
          aria-label={`Show on my phone to ${way.label.toLowerCase()} ${way.number}`}
          onClick={() =>
            setShown(isShown ? null : { id: line.id, mode: way.mode })
          }
        >
          <Smartphone size={14} aria-hidden /> Show on my phone
        </button>
      </div>
    );
  };

  const qrPanel = (line: SupportLine, way: Way) =>
    shown?.id === line.id && shown.mode === way.mode ? (
      <div
        className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-white p-3 text-black"
        role="region"
        aria-label={`Open ${line.name} on your phone`}
      >
        <QrCode
          value={way.uri}
          label={`${way.label} ${way.number}`}
          size={120}
        />
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold">Point your phone&apos;s camera here</p>
          <p className="mt-1 text-sm text-black/70">
            {way.mode === "call"
              ? `It opens ${way.number} in your phone's dialler, ready to call. Most PCs can't make phone calls themselves.`
              : `It opens a text to ${way.number} on your phone.`}
          </p>
          <strong
            className="mt-2 block select-all text-lg tabular-nums"
            data-testid="support-number"
          >
            {way.number}
          </strong>
        </div>
      </div>
    ) : null;

  const generalCard = (line: SupportLine) => (
    <li key={line.id} className="py-3 first:pt-1 last:pb-1">
      <p className="font-semibold text-text-light dark:text-text-dark">
        {line.name}
      </p>
      <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
        {line.hours}
      </p>
      {line.note && (
        <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
          {line.note}
        </p>
      )}
      <ul className="mt-1 divide-y-0">
        {waysOf(line).map((way) => (
          <li key={way.mode} className="mt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-text-light-sub dark:text-text-dark-sub">
                {way.label}
              </span>
              <span className="text-xl font-semibold tabular-nums text-text-light dark:text-text-dark">
                {way.number}
              </span>
            </div>
            {buttons(line, way, takeFirst())}
            {qrPanel(line, way)}
          </li>
        ))}
      </ul>
    </li>
  );

  const youngRow = (line: SupportLine) => (
    <li key={line.id} className="text-sm text-text-light dark:text-text-dark">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <User size={16} aria-hidden className="shrink-0" />
        <span>
          <strong>Under 18?</strong> {line.name} · {line.voice ?? line.text} ·{" "}
          {line.hours}
        </span>
      </div>
      {waysOf(line).map((way) => (
        <div key={way.mode} className="ml-6">
          {buttons(line, way)}
          {qrPanel(line, way)}
        </div>
      ))}
    </li>
  );

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
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark text-text-light dark:text-text-dark shadow-xl"
      >
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="support-title"
                className="font-display text-2xl font-semibold"
              >
                Talk to someone
              </h2>
              <p className="mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
                You don&apos;t have to carry it alone. These lines are free and
                confidential, and this list works without MindSage being online.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-tertiary-light dark:hover:bg-tertiary-dark focus:outline-none focus:ring-2 focus:ring-info"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-text-light-sub dark:text-text-dark-sub">
            <Globe size={16} aria-hidden />
            {data ? (
              <span>
                {chosen
                  ? "Showing lines for"
                  : "Based on this PC's time zone and region:"}{" "}
                {data.name}
              </span>
            ) : (
              <span>
                {somewhereElse
                  ? "Somewhere else"
                  : "Choose your country to see the lines near you."}
              </span>
            )}
            <button
              type="button"
              className="font-medium text-text-light underline underline-offset-2 dark:text-text-dark"
              onClick={() => setOthers(true)}
            >
              Change
            </button>
          </p>

          {data && (
            <>
              <ul className="mt-4 divide-y divide-border-light rounded-2xl bg-tertiary-light/60 p-4 dark:divide-border-dark dark:bg-tertiary-dark/60">
                {general.map(generalCard)}
              </ul>
              {young.length > 0 && (
                <ul className="mt-4 space-y-2">{young.map(youngRow)}</ul>
              )}
            </>
          )}

          {somewhereElse && !data && (
            <p className="mt-4 text-sm">
              {INTERNATIONAL_HELP.text}{" "}
              <a
                href={INTERNATIONAL_HELP.url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                findahelpline.com
              </a>
            </p>
          )}

          <div className="mt-4">
            <button
              ref={othersToggle}
              type="button"
              aria-expanded={others}
              onClick={() => setOthers((o) => !o)}
              className="inline-flex items-center gap-1 text-sm font-medium"
            >
              {others ? (
                <ChevronDown size={16} aria-hidden />
              ) : (
                <ChevronRight size={16} aria-hidden />
              )}
              Other countries
            </button>
            {others && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {SUPPORT_REGIONS.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      className={`${btn} ${r.code === region ? pressed : ""}`}
                      aria-pressed={r.code === region}
                      onClick={() => choose(r.code)}
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      setRegion(null);
                      setChosen(false);
                      setSupportRegion(null);
                      setSomewhereElse(true);
                      setShown(null);
                    }}
                  >
                    Somewhere else
                  </button>
                </li>
              </ul>
            )}
          </div>

          {data && (
            <p className="mt-4 text-sm text-text-light dark:text-text-dark">
              In danger right now? Call the emergency number:{" "}
              <strong className="tabular-nums">{data.emergency}</strong>
            </p>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs text-text-light-sub dark:text-text-dark-sub">
            <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              MindSage is a journal, not therapy or an emergency service.
              Nothing is sent anywhere when you open this. Numbers last checked{" "}
              {VERIFIED_ON}.
            </span>
          </p>
        </div>
        <div className="flex justify-end border-t border-border-light px-6 py-3 dark:border-border-dark">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-light1 px-5 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-info dark:bg-dark1"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
