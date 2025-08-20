import { motion } from "framer-motion";
import clsx from "clsx";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = ({ checked, onCheckedChange }: SwitchProps) => {
  // Define the spring animation for turning the switch ON
  const springTransition = { type: "spring", stiffness: 700, damping: 30 };

  // Define an instant transition for turning the switch OFF
  const instantTransition = { duration: 0 };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      // --- CHANGES: Added border and removed focus ring ---
      className={clsx(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none",
        "border border-border-light dark:border-border-dark",
        {
          "bg-info": checked,
          "bg-tertiary-light dark:bg-tertiary-dark": !checked,
        }
      )}
    >
      <motion.span
        className="inline-block h-4 w-4 transform rounded-full bg-white"
        // --- CHANGE: Conditional transition for animation ---
        transition={springTransition}
        initial={false}
        animate={{ x: checked ? "1.5rem" : "0.25rem" }} // 24px and 4px
      />
    </button>
  );
};
