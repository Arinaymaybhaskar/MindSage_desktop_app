import { Link } from "react-router-dom";
import { formatTimeAgo } from "../utils/DateFormatter"; // Assuming you have this utility
import { motion } from "framer-motion";

const RecentEntryCard = ({ entry }) => {
  const moodTags = Array.isArray(entry.mood_tags) ? entry.mood_tags : [];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl flex flex-col shadow-sm hover:shadow-lg"
    >
      <Link
        to={`/journal/view/${entry.id}`}
        className="flex flex-col h-full p-5"
      >
        {/* Card Header */}
        <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-1 truncate">
          {entry.title}
        </h3>
        <p className="text-xs text-text-light-sub dark:text-text-dark-sub mb-3">
          {formatTimeAgo(entry.created_at)}
        </p>

        {/* Card Body */}
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub line-clamp-3 flex-grow">
          {entry.content}
        </p>

        {/* Card Footer with Tags */}
        {moodTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {moodTags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 px-2.5 py-1 rounded-full text-xs font-semibold"
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
