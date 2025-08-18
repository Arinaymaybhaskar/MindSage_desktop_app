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

  // Group unpinned goals by their parent ambition title
  const groupedGoals = unpinnedGoals.reduce((acc, goal) => {
    const key = goal.parent_goal_title || "Your Goals";
    if (!acc[key]) acc[key] = [];
    acc[key].push(goal);
    return acc;
  }, {} as Record<string, Goal[]>);

  // Animation variants for the grid and cards
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
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

  // If there are no goals at all, show the polished empty state
  if (goals.length === 0) {
    return (
      <EmptyState
        Icon={Target}
        title="No Active Goals"
        message="Ready to achieve something great? Add your first goal to get started."
        action={
          <button
            onClick={onAddGoalClick}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
          >
            <span>Add Your First Goal</span>
          </button>
        }
      />
    );
  }

  return (
    <section id="active-goals-section" className="space-y-12">
      {/* Render pinned goals first, without a header */}
      {pinnedGoals.length > 0 && <div>{renderGrid(pinnedGoals)}</div>}

      {/* Grouped Goals Section */}
      {Object.entries(groupedGoals).map(([groupName, groupGoals]) => (
        <div key={groupName}>
          <h3 className="text-2xl font-semibold mb-4 text-gray-200">
            {groupName === "Your Goals" ? (
              groupName
            ) : (
              <>
                <span className="font-normal text-gray-400">Ambition: </span>
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
