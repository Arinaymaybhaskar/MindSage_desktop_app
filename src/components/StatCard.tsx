import React from "react";
import { motion } from "framer-motion";

interface StatCardProps {
  icon?: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value }) => {
  return (
    <motion.div
      className="
    bg-secondary-light dark:bg-secondary-dark
    border border-border-light dark:border-border-dark
    rounded-xl p-4 px-8 flex items-center gap-4
    shadow-lv2 dark:shadow-lv2-dark
    hover:shadow-lv3 dark:hover:shadow-lv3-dark
    transition-shadow duration-300
  "
      // whileHover={{ scale: 1.001 }}
      transition={{ type: "spring", stiffness: 250 }}
    >
      <div>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          {label}
        </p>
        <p className="text-3xl font-extrabold text-text-light dark:text-text-dark">
          {value}
        </p>
      </div>
    </motion.div>
  );
};

export default StatCard;
