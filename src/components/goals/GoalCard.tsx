import React, { useState, useRef, useEffect } from "react";
import type { Category, Goal } from "../../types/Goals";
import { getContrastingTextColor } from "../../utils/contrastingColor";
import {
  MoreVertical,
  Pin,
  PinOff,
  Edit,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface GoalCardProps {
  goal: Goal;
  category: Category | undefined;
  onEdit: () => void;
  onDelete: (id: number) => void;
  onLogProgress: () => void;
  onTogglePin: (id: number) => void;
  onMarkComplete: (id: number) => void;
}

const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  category,
  onEdit,
  onDelete,
  onLogProgress,
  onTogglePin,
  onMarkComplete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const bgColor = category?.color || "var(--color-info)";
  const textColor = getContrastingTextColor(bgColor);
  const progressPercentage = Math.min(
    100,
    Math.round((goal.current_value / goal.target_value) * 100)
  );
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  const handleMenuAction = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  return (
    <div className="goal-card bg-secondary-light dark:bg-secondary-dark text-text-light dark:text-text-dark p-4 rounded-xl shadow-md flex flex-col transition-all duration-300  hover:shadow-xl border border-border-light dark:border-border-dark w-80 h-96">
      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {/* Card Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 pr-2">
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: bgColor, color: textColor }}
            >
              {category?.name || "Uncategorized"}
            </span>
            <button
              onClick={() => navigate(`/goals/view/${goal.id}`)}
              className="text-lg font-bold mt-2 flex text-start break-words cursor-pointer hover:underline"
            >
              {goal.title}
            </button>
          </div>

          {/* Menu Dropdown */}
          <div className="relative" ref={menuRef}>
            <div className="flex justify-center items-center">
              {goal.is_pinned ? (
                <Pin
                  size={20}
                  className="text-text-light-sub dark:text-text-dark-sub mr-1"
                />
              ) : (
                ""
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
              >
                <MoreVertical size={20} />
              </button>
            </div>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-48 bg-surface-light dark:bg-surface-dark rounded-lg shadow-lg py-2 z-10 border border-border-light dark:border-border-dark"
                >
                  {[
                    {
                      label: goal.is_pinned ? "Unpin" : "Pin",
                      icon: goal.is_pinned ? (
                        <PinOff size={16} />
                      ) : (
                        <Pin size={16} />
                      ),
                      action: () => onTogglePin(goal.id),
                    },
                    {
                      label: "Edit",
                      icon: <Edit size={16} />,
                      action: onEdit,
                    },
                    {
                      label: "Mark as Complete",
                      icon: <CheckCircle size={16} />,
                      action: () => onMarkComplete(goal.id),
                    },
                    {
                      label: "Delete",
                      icon: <Trash2 size={16} />,
                      action: () => onDelete(goal.id),
                      isDestructive: true,
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleMenuAction(item.action)}
                      className={`flex items-center gap-3 w-full text-left px-4 py-2 text-sm ${
                        item.isDestructive
                          ? "text-danger"
                          : "text-text-light dark:text-text-dark"
                      } hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Description */}
        {goal.description && (
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1 mb-4 p-3 bg-tertiary-light dark:bg-tertiary-dark rounded-lg whitespace-pre-wrap">
            {goal.description}
          </p>
        )}
      </div>

      {/* Progress Section */}
      <div className="pt-4 border-t border-border-light dark:border-border-dark mt-auto">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-text-light-sub dark:text-text-dark-sub">
            Progress
          </span>
          <span className="text-xs font-semibold" style={{ color: bgColor }}>
            {`${goal.current_value} / ${goal.target_value} ${goal.unit || ""}`}
          </span>
        </div>
        <div className="w-full bg-tertiary-light dark:bg-tertiary-dark rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPercentage}%`,
              backgroundColor: bgColor,
            }}
          ></div>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={onLogProgress}
        className="mt-5 w-full font-bold py-2.5 px-4 rounded-lg transition-opacity duration-300 hover:opacity-90 flex-shrink-0"
        style={{ backgroundColor: bgColor, color: textColor }}
      >
        Log Progress
      </button>
    </div>
  );
};

export default GoalCard;
