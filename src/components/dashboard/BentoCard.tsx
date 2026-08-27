import React from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

/**
 * One tile of the dashboard's bento grid.
 *
 * The previous dashboard drew every panel as the same bordered rectangle at the
 * same size, which is why it read as a form rather than as a picture of
 * someone's year. A single tile shell with varying spans lets the important
 * things be physically bigger, which is the whole point of the layout.
 */
interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger index, so the grid assembles rather than appearing all at once. */
  index?: number;
  testId?: string;
  /** Slightly lifted treatment for the one or two tiles that lead the page. */
  emphasis?: boolean;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  children,
  className,
  index = 0,
  testId,
  emphasis = false,
}) => (
  <motion.section
    data-testid={testId}
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{
      duration: 0.4,
      delay: Math.min(index, 8) * 0.045,
      ease: [0.22, 1, 0.36, 1],
    }}
    className={clsx(
      "relative overflow-hidden rounded-2xl border p-4",
      emphasis
        ? "border-border-light/80 dark:border-border-dark/80 bg-surface-light dark:bg-surface-dark"
        : "border-border-light/60 dark:border-border-dark/60 bg-secondary-light dark:bg-secondary-dark",
      className,
    )}
  >
    {children}
  </motion.section>
);

/** Small all-caps label used at the top of the compact tiles. */
export const TileLabel: React.FC<{
  icon?: React.ElementType;
  children: React.ReactNode;
}> = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-light-sub/80 dark:text-text-dark-sub/80">
    {Icon && <Icon size={12} />}
    {children}
  </div>
);

export default BentoCard;
