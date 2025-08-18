import React from "react";
import { motion } from "framer-motion";

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string; // e.g., 'indigo', 'green', 'purple'
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  color,
}) => {
  const colorClasses = {
    indigo:
      "bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    green:
      "bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400",
    purple:
      "bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };

  return (
    <motion.div
      className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4"
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div className={`p-3 rounded-full ${colorClasses[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </p>
      </div>
    </motion.div>
  );
};

export default StatCard;
