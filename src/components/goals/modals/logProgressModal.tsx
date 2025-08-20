import React, { useState, useEffect } from "react";
import Modal from "../../Modal";
import type { Category, Goal } from "../../../types/Goals";
import { Save, X, Target, NotebookText } from "lucide-react";

interface LogProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: Goal;
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

  // --- CHANGE: Default to the theme's 'info' color variable ---
  const themeColor = category?.color || "var(--color-info)";
  const progressPercentage = Math.max(
    0,
    Math.min(100, (currentValue / goal.target_value) * 100)
  );

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Log Progress for "${goal.title}"`}
    >
      <div className="text-text-light dark:text-text-dark">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Animated Progress Bar */}
          <div>
            <div className="flex justify-between text-sm font-medium mb-1">
              <span className="text-text-light-sub dark:text-text-dark-sub">
                Progress
              </span>
              <span style={{ color: themeColor }}>
                {progressPercentage.toFixed(0)}%
              </span>
            </div>
            {/* --- CHANGE: Themed progress bar track --- */}
            <div className="w-full bg-tertiary-light dark:bg-tertiary-dark rounded-full h-2.5">
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
                // --- CHANGE: Themed slider ---
                className="w-full h-2 bg-tertiary-light dark:bg-tertiary-dark rounded-lg appearance-none cursor-pointer slider-thumb"
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
                  // --- CHANGE: Themed number input ---
                  className="w-28 rounded-lg border border-border-light dark:border-border-dark bg-tertiary-light dark:bg-tertiary-dark px-3 py-2 text-center focus:border-info focus:ring-2 focus:ring-info focus:outline-none"
                  required
                />
              </div>
            </div>
            {/* --- CHANGE: Themed target text --- */}
            <div className="flex items-center justify-center gap-2 text-xs text-text-light-sub dark:text-text-dark-sub">
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
              // --- CHANGE: Themed label text ---
              className="flex items-center gap-2 mb-2 text-sm font-medium text-text-light dark:text-text-dark"
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
              // --- CHANGE: Themed textarea ---
              className="w-full rounded-lg border border-border-light dark:border-border-dark bg-tertiary-light dark:bg-tertiary-dark px-3 py-2 shadow-sm focus:border-info focus:ring-2 focus:ring-info focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              // --- CHANGE: Themed cancel button ---
              className="flex items-center gap-2 rounded-lg bg-tertiary-light dark:bg-tertiary-dark px-4 py-2 font-semibold text-text-light dark:text-text-dark transition-all duration-200 hover:scale-105"
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
