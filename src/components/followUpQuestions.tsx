import { useState } from "react";
import { motion } from "framer-motion";
import { MindSageMark } from "./ui/MindSageMark";
import clsx from "clsx";

interface FollowUpQuestionProps {
  questions: string[];
}

export function FollowUpQuestions({ questions }: FollowUpQuestionProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);

  return (
    // --- CHANGE: Themed main container ---
    <div className="bg-tertiary-light dark:bg-tertiary-dark rounded-xl p-4 border border-border-light dark:border-border-dark">
      <h3 className="text-sm font-semibold mb-3 text-text-light dark:text-text-dark flex items-center gap-2">
        <MindSageMark size={16} className="text-dark1 dark:text-light1" />
        Follow-up Questions
      </h3>
      <div className="space-y-2">
        {questions.map((question, index) => (
          <motion.div
            key={index}
            // --- CHANGE: Themed question items with cleaner styling and animation ---
            className={clsx(
              "bg-surface-light dark:bg-surface-dark p-2.5 rounded-lg transition-all duration-200 border cursor-pointer",
              {
                "border-info shadow-md": selectedQuestion === index,
                "border-border-light dark:border-border-dark hover:border-border-light/70 dark:hover:border-border-dark/70":
                  selectedQuestion !== index,
              },
            )}
            whileTap={{ scale: 0.98 }}
            onClick={() =>
              setSelectedQuestion(selectedQuestion === index ? null : index)
            }
          >
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              {question}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
