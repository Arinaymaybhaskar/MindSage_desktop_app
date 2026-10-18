import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import SupportSheet from "./SupportSheet";

/**
 * "Going through a lot? Talk to someone", pinned at the bottom of Today above
 * the dock. A real button, so the keyboard reaches it; the sheet it opens works
 * offline.
 */
export default function PinnedSupportLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="pointer-events-none sticky bottom-[5.5rem] z-30 flex justify-center px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark px-4 py-2 text-sm font-medium text-text-light dark:text-text-dark shadow-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-info"
        >
          <LifeBuoy size={16} aria-hidden />
          Going through a lot? Talk to someone
        </button>
      </div>
      <SupportSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
