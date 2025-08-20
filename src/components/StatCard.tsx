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
      className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl p-4 flex items-center gap-4"
      whileHover={{ scale: 1.005 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <div className={`p-3 rounded-full ${colorClasses[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          {label}
        </p>
        <p className=" text-2xl font-bold text-text-light dark:text-text-dark">
          {value}
        </p>
      </div>
    </motion.div>
  );
};

export default StatCard;
