import React from "react";
import { motion, type Variants } from "framer-motion";

/**
 * Word-by-word reveal for text that is still being generated.
 *
 * The variants are motion-primitives' `TextEffect` "fade-in-blur" preset (MIT,
 * ibelick/motion-primitives), but driven differently. `TextEffect` staggers a
 * finished string once on mount; a streamed reply has no finished string, and
 * re-running a stagger on every token would restart the whole paragraph
 * several times a second.
 *
 * Instead each word animates on **mount**. Words already on screen keep their
 * key, so React leaves them alone and only the words that just arrived fade
 * in.
 *
 * The preset's blur and vertical travel are both dropped. On text that appears
 * every few milliseconds they read as a flinch rather than as writing, and the
 * blur in particular makes each word briefly unreadable exactly when the eye
 * arrives at it. A plain opacity fade gives the same sense of arrival without
 * ever degrading the text.
 */
const wordVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.22, ease: "easeOut" },
  },
};

/**
 * Wraps each word of `text` so it fades in as it appears.
 *
 * `keyPrefix` must be stable for a given position in the document - it is what
 * tells React a word is the same word it rendered last frame rather than a new
 * one to animate again.
 */
export function revealWords(
  text: string,
  keyPrefix: string,
): React.ReactNode[] {
  // Splitting on a captured group keeps the whitespace, so spacing and line
  // breaks survive. Whitespace is emitted unwrapped: animating it would make
  // the gaps between words visibly widen.
  return text.split(/(\s+)/).map((chunk, index) => {
    if (chunk === "") return null;
    if (/^\s+$/.test(chunk)) {
      return (
        <React.Fragment key={`${keyPrefix}-s${index}`}>{chunk}</React.Fragment>
      );
    }
    return (
      <motion.span
        key={`${keyPrefix}-w${index}`}
        variants={wordVariants}
        initial="hidden"
        animate="visible"
        className="inline-block whitespace-pre"
      >
        {chunk}
      </motion.span>
    );
  });
}

/** Wraps an already-built node (a link, bold run, or code span) in the same reveal. */
export function revealNode(
  node: React.ReactNode,
  key: string,
): React.ReactNode {
  return (
    <motion.span
      key={key}
      variants={wordVariants}
      initial="hidden"
      animate="visible"
      className="inline-block whitespace-pre"
    >
      {node}
    </motion.span>
  );
}

export default revealWords;
