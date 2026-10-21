import { ASK_DISCLAIMER } from "../../constants/askDisclaimer";

const key =
  "rounded border border-border-light dark:border-border-dark bg-tertiary-light dark:bg-tertiary-dark px-1.5 py-0.5 font-mono text-[11px]";

/**
 * Under the Ask composer: what Ask is, what its answers are made of, and the
 * keys (KAN-51). The first sentence is the one the ticket requires everywhere
 * Ask is shown.
 */
export default function AskFooter() {
  return (
    <div className="mx-auto mt-2 flex w-full max-w-[44rem] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-text-light-sub dark:text-text-dark-sub">
      <p data-testid="ask-disclaimer" className="min-w-0 flex-1 basis-64">
        {ASK_DISCLAIMER} Answers come from your entries and can be wrong. Check
        the sources.
      </p>
      <p className="flex shrink-0 items-center gap-1">
        <kbd className={key}>Enter</kbd> to send ·{" "}
        <kbd className={key}>Shift</kbd> <kbd className={key}>Enter</kbd> new
        line
      </p>
    </div>
  );
}
