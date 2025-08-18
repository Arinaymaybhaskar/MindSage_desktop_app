// src/components/PinnedGoalCard.tsx
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const PinnedGoalCard = ({ goal }) => {
  const progressPercentage = Math.min(
    100,
    Math.round((goal.current_value / goal.target_value) * 100)
  );

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col h-full"
    >
      <Link to={`/goals`} className="flex flex-col h-full">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2">
            {goal.title}
          </h3>
        </div>
        <div className="mt-auto">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Progress
            </span>
            <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400">
              {progressPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-indigo-500"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default PinnedGoalCard;
