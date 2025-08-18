import React from "react";
import type { Goal } from "../../types/Goals";
import { CheckCircle2, NotebookText, Trash2Icon } from "lucide-react";

interface CompletedGoalItemProps {
  goal: Goal;
  onViewReflection: (goal: Goal) => void;
  onDelete: any;
}

const CompletedGoalItem: React.FC<CompletedGoalItemProps> = ({
  goal,
  onViewReflection,
  onDelete,
}) => {
  // Format the date for better readability. Handles cases where date might be null.
  const formattedDate = goal.completed_date
    ? new Date(goal.completed_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "at an unknown date";

  return (
    <div
      className="flex items-center justify-between gap-4 p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600"
      data-id={goal.id}
    >
      {/* Left side: Icon, Title, and Date */}
      <div className="flex items-center gap-4 min-w-0">
        <CheckCircle2
          size={28}
          className="text-green-500 dark:text-green-400 flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="font-semibold truncate" title={goal.title}>
            {goal.title}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Completed on {formattedDate}
          </p>
        </div>
      </div>

      {/* Right side: "View Reflection" Button */}
      <div className="flex justify-center items-center gap-2">
        <button
          onClick={() => onViewReflection(goal)}
          className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap px-4 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors duration-200"
        >
          <NotebookText size={16} />
          <span>View Reflection</span>
        </button>
        <button onClick={() => onDelete(goal)} className="hover:text-red-400">
          <Trash2Icon size={20} />
        </button>
      </div>
    </div>
  );
};

export default CompletedGoalItem;
