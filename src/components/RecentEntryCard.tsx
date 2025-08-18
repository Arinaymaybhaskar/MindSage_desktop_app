import { Link } from "react-router-dom";
import { formatTimeAgo } from "../utils/DateFormatter";
import { motion } from "framer-motion";

const RecentEntryCard = ({ entry }) => {
  const moodTags = Array.isArray(entry.mood_tags) ? entry.mood_tags : [];

  return (
    <motion.div
      whileHover={{
        y: -5,
        boxShadow:
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
      }}
      className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col"
    >
      <Link to={`/journal/view/${entry.id}`} className="flex flex-col h-full">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {entry.title}
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {formatTimeAgo(entry.created_at)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 flex-grow">
          {entry.content}
        </p>
        {moodTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {moodTags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 px-2.5 py-1 rounded-full text-xs font-semibold"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </motion.div>
  );
};

export default RecentEntryCard;
