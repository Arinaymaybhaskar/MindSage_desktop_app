import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, PenLine, Search } from "lucide-react";
import TextShimmer from "../ui/TextShimmer";
import { MindSageMark } from "../ui/MindSageMark";

export type ChatPhase = "thinking" | "searching" | "writing";

/**
 * Icon per stage of the reply pipeline. The three stages do genuinely
 * different work - classifying the question, searching entries, generating
 * prose - and a glyph reads faster than the caption does.
 */
const PHASE_ICONS: Record<ChatPhase, React.ElementType> = {
  thinking: Brain,
  searching: Search,
  writing: PenLine,
};

/**
 * Shown while a reply is being produced but has no text yet.
 *
 * Laid out to match the assistant's finished messages - same avatar, same left
 * gutter - so that when the first token lands, the caption is replaced by text
 * on the same line instead of the whole block jumping. The previous version was
 * a bordered speech bubble left over from before the assistant messages were
 * unboxed, so it visibly belonged to a different design.
 */
export const LoadingBubble: React.FC<{
  message: string;
  phase?: ChatPhase | null;
}> = ({ message, phase }) => {
  const PhaseIcon = phase ? PHASE_ICONS[phase] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3 w-full"
    >
      <div className="relative mt-0.5 flex-shrink-0 w-7 h-7">
        {/* A ring breathing outward from the avatar: the one piece of motion
            that says "still working" even if the caption is not being read. */}
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-light1/50 dark:bg-dark1"
          animate={{ scale: [1, 1.45, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative w-7 h-7 rounded-full bg-light1/40 dark:bg-dark1 flex items-center justify-center">
          <MindSageMark size={14} className="text-dark1 dark:text-light1" />
        </div>
      </div>

      <div className="min-w-0 flex-1 flex items-center gap-2 h-7">
        {/* Crossfade rather than swap, so moving between stages reads as one
            continuous process instead of three separate loaders. */}
        <AnimatePresence mode="wait" initial={false}>
          {PhaseIcon && (
            <motion.span
              key={phase}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              className="flex-shrink-0 text-text-light-sub dark:text-text-dark-sub"
            >
              <PhaseIcon size={14} />
            </motion.span>
          )}
        </AnimatePresence>

        <TextShimmer
          key={message}
          duration={1.6}
          spread={1.2}
          className="text-sm"
        >
          {message}
        </TextShimmer>
      </div>
    </motion.div>
  );
};

export default LoadingBubble;
