import React, { useState, useEffect } from "react";
import Modal from "../../Modal";
import type { Category, Goal } from "../../../types/Goals";
import { Save, X, Target, NotebookText } from "lucide-react";

interface LogProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: Goal;
  // Pass the category to use its color for theming
  category: Category | undefined;
  onSubmit: (
    goalId: number,
    newCurrentValue: number,
    description: string
  ) => void;
}

const LogProgressModal: React.FC<LogProgressModalProps> = ({
  isOpen,
  onClose,
  goal,
  category,
  onSubmit,
}) => {
  const [currentValue, setCurrentValue] = useState(goal.current_value);
  const [description, setDescription] = useState("");

  const themeColor = category?.color || "#6366F1"; // Default to indigo
  const progressPercentage = Math.max(
    0,
    Math.min(100, (currentValue / goal.target_value) * 100)
  );

  // Reset state when the goal changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentValue(goal.current_value);
      setDescription("");
    }
  }, [isOpen, goal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(goal.id, currentValue, description);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={goal.title}>
      <div className="text-gray-800 dark:text-gray-100">
        {/* Themed Header */}
        {/* <div
          className="p-4 rounded-t-lg mb-6 -m-6"
          style={{ backgroundColor: themeColor }}
        >
          <h2 className="text-xl font-bold text-white text-center">
            {goal.title}
          </h2>
        </div> */}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Animated Progress Bar */}
          <div>
            <div className="flex justify-between text-sm font-medium mb-1">
              <span className="text-gray-600 dark:text-gray-300">Progress</span>
              <span style={{ color: themeColor }}>
                {progressPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progressPercentage}%`,
                  backgroundColor: themeColor,
                }}
              ></div>
            </div>
          </div>

          {/* Interactive Progress Input */}
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-4">
              <input
                type="range"
                value={currentValue}
                onChange={(e) => setCurrentValue(Number(e.target.value))}
                max={goal.target_value}
                min={0}
                step="1"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider-thumb"
                style={{ "--thumb-color": themeColor } as React.CSSProperties}
              />
              <div className="relative">
                <input
                  type="number"
                  id="goal-current-value"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(Number(e.target.value))}
                  max={goal.target_value}
                  min={0}
                  className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-2 text-center focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Target size={14} />
              <span>
                Target: {goal.target_value} {goal.unit}
              </span>
            </div>
          </div>

          {/* Comments Textarea */}
          <div>
            <label
              htmlFor="description"
              className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              <NotebookText size={16} />
              <span>Comments (Optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any thoughts on your progress?"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 rounded-lg bg-gray-200 dark:bg-gray-600 px-4 py-2 font-semibold text-gray-700 dark:text-gray-200 transition-transform duration-200 hover:scale-105"
            >
              <X size={18} />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md"
              style={{ backgroundColor: themeColor }}
            >
              <Save size={18} />
              <span>Save Progress</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default LogProgressModal;
