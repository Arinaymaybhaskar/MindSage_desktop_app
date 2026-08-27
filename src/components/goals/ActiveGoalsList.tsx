import React from "react";
import GoalCard from "./GoalCard";
import type { Category, Goal } from "../../types/Goals";
import { motion } from "framer-motion";
import { Pin, Target } from "lucide-react";
import EmptyState from "../EmptyState";

interface ActiveGoalsListProps {
  goals: Goal[];
  categories: Category[];
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onLogProgress: (goal: Goal) => void;
  onTogglePin: (goalId: number) => void;
  onMarkComplete: (goalId: number) => void;
  onAddGoalClick: () => void;
}

const ActiveGoalsList: React.FC<ActiveGoalsListProps> = (props) => {
  const { goals, categories, onAddGoalClick } = props;

  const pinnedGoals = goals.filter((g) => g.is_pinned);
  const unpinnedGoals = goals.filter((g) => !g.is_pinned);

  const groupedGoals = unpinnedGoals.reduce(
    (acc, goal) => {
      const key = goal.parent_goal_title || "General Goals";
      if (!acc[key]) acc[key] = [];
      acc[key].push(goal);
      return acc;
    },
    {} as Record<string, Goal[]>,
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  const renderGrid = (goalsToRender: Goal[]) => (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {goalsToRender.map((goal) => (
        <motion.div key={goal.id} variants={itemVariants}>
          <GoalCard
            goal={goal}
            category={categories.find((c) => c.id === goal.category_id)}
            onEdit={() => props.onEdit(goal)}
            onDelete={() => props.onDelete(goal)}
            onLogProgress={() => props.onLogProgress(goal)}
            onTogglePin={() => props.onTogglePin(goal.id)}
            onMarkComplete={() => props.onMarkComplete(goal.id)}
          />
        </motion.div>
      ))}
    </motion.div>
  );

  if (goals.length === 0) {
    return (
      <EmptyState
        Icon={Target}
        title="No Active Goals"
        message="Ready to achieve something great? Add your first goal to get started."
        action={
          // --- CHANGE: Themed action button ---
          <button
            onClick={onAddGoalClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-light1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1 transition-all"
          >
            <span>Add Your First Goal</span>
          </button>
        }
      />
    );
  }

  return (
    <section id="active-goals-section" className="space-y-12 mt-8">
      {/* --- CHANGE: Added a clear header for Pinned Goals --- */}
      {pinnedGoals.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 font-display text-2xl font-semibold mb-4 px-2 text-text-light dark:text-text-dark">
            <Pin size={22} className="text-dark1 dark:text-light1" />
            Pinned
          </h3>
          {renderGrid(pinnedGoals)}
        </div>
      )}

      {/* Grouped Goals Section */}
      {Object.entries(groupedGoals).map(([groupName, groupGoals]) => (
        <div key={groupName}>
          {/* --- CHANGE: Themed group headers --- */}
          <h3 className="font-display text-2xl font-semibold mb-4 px-2 text-text-light dark:text-text-dark">
            {groupName === "General Goals" ? (
              groupName
            ) : (
              <>
                <span className="font-normal text-text-light-sub dark:text-text-dark-sub">
                  Ambition:{" "}
                </span>
                {groupName}
              </>
            )}
          </h3>
          {renderGrid(groupGoals)}
        </div>
      ))}
    </section>
  );
};

export default ActiveGoalsList;
