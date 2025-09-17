import React from "react";
import type { Goal } from "../../types/Goals";
import { CheckCircle2, NotebookText, Trash2Icon } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CompletedGoalItemProps {
  goal: Goal;
  onViewReflection: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

const CompletedGoalItem: React.FC<CompletedGoalItemProps> = ({
  goal,
  onViewReflection,
  onDelete,
}) => {
  const navigate = useNavigate();
  const formattedDate = goal.completed_date
    ? new Date(goal.completed_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "at an unknown date";

  return (
    // --- CHANGE: Themed container ---
    <div
      className="flex items-center justify-between gap-4 p-4 bg-secondary-light dark:bg-secondary-dark rounded-xl border border-border-light dark:border-border-dark transition-all hover:shadow-md hover:border-border-light/80 dark:hover:border-border-dark/80"
      data-id={goal.id}
    >
      {/* Left side: Icon, Title, and Date */}
      <div className="flex items-center gap-4 min-w-0">
        {/* --- CHANGE: Themed icon color --- */}
        <CheckCircle2 size={28} className="text-success flex-shrink-0" />
        <div className="min-w-0">
          {/* --- CHANGE: Themed text colors --- */}
          <button
            onClick={() => navigate(`/goals/view/${goal.id}`)}
            className="font-semibold truncate text-text-light dark:text-text-dark"
            title={goal.title}
          >
            {goal.title}
          </button>
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
            Completed on {formattedDate}
          </p>
        </div>
      </div>

      {/* Right side: Action Buttons */}
      <div className="flex justify-center items-center gap-2">
        {/* --- CHANGE: Themed "View Reflection" button --- */}
        <button
          onClick={() => onViewReflection(goal)}
          className="flex items-center gap-2 text-sm font-semibold text-dark1 dark:text-light1 whitespace-nowrap px-4 py-2 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors duration-200"
        >
          <NotebookText size={16} />
          <span>View Reflection</span>
        </button>
        {/* --- CHANGE: Themed delete button --- */}
        <button
          onClick={() => onDelete(goal)}
          className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-danger dark:hover:text-danger transition-colors"
          aria-label="Delete Goal"
        >
          <Trash2Icon size={18} />
        </button>
      </div>
    </div>
  );
};

export default CompletedGoalItem;
