import React, { useMemo } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

/**
 * A light sweeping left-to-right through the text itself.
 *
 * Adapted from motion-primitives' `TextShimmer` (MIT, ibelick/motion-primitives),
 * which is published as a copy-paste component rather than a package. Three
 * changes were needed here:
 *
 *  - imports `framer-motion` instead of `motion/react`
 *  - uses `clsx`, since this project has no `cn`/tailwind-merge helper
 *  - takes its colours from the theme tokens rather than hard-coded zinc, so it
 *    follows the user's selected palette like everything else
 *
 * The effect is a transparent-text/background-clip trick: a moving gradient is
 * painted behind the glyphs and shows through them, with a flat base colour
 * underneath so the text stays readable at every point in the sweep.
 */
export type TextShimmerProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  /** Seconds for one full sweep. */
  duration?: number;
  /** Width of the travelling highlight, as a multiple of the text length. */
  spread?: number;
};

function TextShimmerComponent({
  children,
  as: Component = "span",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const MotionComponent = useMemo(
    () => motion.create(Component as React.ElementType),
    [Component]
  );

  // Scaling the highlight to the text length keeps the sweep looking the same
  // on a short caption and a long one.
  const dynamicSpread = useMemo(
    () => children.length * spread,
    [children, spread]
  );

  return (
    <MotionComponent
      className={clsx(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[background-repeat:no-repeat,padding-box]",
        "[--base-color:var(--color-text-light-sub)] [--base-gradient-color:var(--color-text-light)]",
        "dark:[--base-color:var(--color-text-dark-sub)] dark:[--base-gradient-color:var(--color-text-dark)]",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{ repeat: Infinity, duration, ease: "linear" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--base-color), var(--base-color))",
        } as React.CSSProperties
      }
    >
      {children}
    </MotionComponent>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);

export default TextShimmer;
