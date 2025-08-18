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

  const bgColor = category?.color || "#4B5563"; // Default to a neutral gray
  const textColor = getContrastingTextColor(bgColor);
  const progressPercentage = Math.min(
    100,
    Math.round((goal.current_value / goal.target_value) * 100)
  );

  // Effect to close menu when clicking outside
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
    <div className="goal-card bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 rounded-xl shadow-md flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-transparent dark:border-gray-700 w-80 h-96">
      {/* This new wrapper allows the content to grow and scroll if it exceeds the available space */}
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
            <h4 className="text-lg font-bold mt-2 break-words">{goal.title}</h4>
          </div>

          {/* Menu Dropdown */}
          <div className="relative" ref={menuRef}>
            <div className="flex justify-center items-center">
              {goal.is_pinned ? <Pin size={20} /> : ""}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <MoreVertical size={20} />
              </button>
            </div>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-2 z-10 border border-gray-200 dark:border-gray-700">
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
                        ? "text-red-600 dark:text-red-500"
                        : "text-gray-700 dark:text-gray-300"
                    } hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {goal.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg whitespace-pre-wrap">
            {goal.description}
          </p>
        )}
      </div>

      {/* Progress Section */}
      <div className="pt-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Progress
          </span>
          <span className="text-xs font-semibold" style={{ color: bgColor }}>
            {`${goal.current_value} / ${goal.target_value} ${goal.unit || ""}`}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
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
