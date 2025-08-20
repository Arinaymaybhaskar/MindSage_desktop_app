import React, { useState, useEffect, useMemo } from "react";
import Modal from "../../Modal";
import ColorPalette from "../ColorPalette";
import type { Category, Goal } from "../../../types/Goals";
import { categoryService } from "../../../api/categoryService";
import { useAuth } from "../../../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Calendar,
  Hash,
  Ruler,
  Tag,
  PlusCircle,
  Save,
  X,
} from "lucide-react";
import { Dropdown } from "../../ui/Dropdown"; // Import your custom Dropdown

interface ManualGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (goalData: any, newCategory?: Category) => void;
  initialData: Goal | null;
  categories: Category[];
  mode: "create" | "edit";
}

const ManualGoalModal: React.FC<ManualGoalModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  categories,
  mode,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | number>("");
  const [targetValue, setTargetValue] = useState<number | string>(1);
  const [unit, setUnit] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#4ade80");

  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const themeColor =
    categories.find((c) => c.id === categoryId)?.color || "var(--color-info)";

  // All logic (useEffect, handleSubmit) remains the same...
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setDescription(initialData.description || "");
        setCategoryId(initialData.category_id ?? "");
        setTargetValue(initialData.target_value);
        setUnit(initialData.unit);
        setTargetDate(initialData.target_date || "");
        setShowNewCategory(false);
      } else {
        // Reset for new goal
        setTitle("");
        setDescription("");
        setCategoryId(categories.length > 0 ? categories[0].id : "add_new");
        setTargetValue(1);
        setUnit("");
        setTargetDate("");
        setShowNewCategory(categories.length === 0);
      }
    }
  }, [initialData, isOpen, categories]);

  useEffect(() => {
    setShowNewCategory(categoryId === "add_new");
  }, [categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalCategoryId: number | string = categoryId;
    let createdCategory;

    if (showNewCategory) {
      if (!newCategoryName.trim()) {
        alert("Please provide a name for the new category.");
        return;
      }
      try {
        createdCategory = await categoryService.addCategory(
          authMode,
          accessToken!,
          newCategoryName,
          newCategoryColor
        );
        finalCategoryId = createdCategory.lastInsertRowid;
      } catch (error) {
        console.error("Failed to create category:", error);
        alert("Failed to create the new category. Please try again.");
        return;
      }
    }

    const goalData = {
      id: initialData?.id,
      title,
      description,
      category_id: Number(finalCategoryId),
      target_value: Number(targetValue),
      unit,
      target_date: targetDate,
      current_value: initialData?.current_value || 0,
      is_completed: initialData?.is_completed ? 1 : 0,
      is_pinned: initialData?.is_pinned ? 1 : 0,
    };

    onSubmit(goalData, createdCategory);
    onClose();
  };

  // --- CHANGE: Themed input styling ---
  const inputClasses =
    "w-full p-2.5 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg focus:ring-2 focus:ring-info focus:border-info outline-none transition";
  const labelClasses =
    "flex items-center gap-2 mb-2 text-sm font-medium text-text-light dark:text-text-dark";

  // Prepare options for the custom dropdown
  const categoryOptions = useMemo(() => {
    const options = categories.map((cat) => ({
      value: cat.id,
      label: cat.name,
    }));
    options.push({ value: "add_new", label: "✨ Add New Category..." });
    return options;
  }, [categories]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "edit" ? "Edit Goal" : "Create a New Goal"}
    >
      <div className="text-text-light dark:text-text-dark">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Goal Title */}
          <div>
            <label htmlFor="manual-goal-title" className={labelClasses}>
              <FileText size={16} /> Goal Title
            </label>
            <input
              type="text"
              id="manual-goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClasses}
              placeholder="e.g., Read 12 books this year"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="manual-goal-description" className={labelClasses}>
              <FileText size={16} /> Description (Optional)
            </label>
            <textarea
              id="manual-goal-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClasses}
              placeholder="Add more context or motivation..."
            ></textarea>
          </div>

          {/* --- CHANGE: Replaced <select> with <Dropdown> --- */}
          <div>
            <label className={labelClasses}>
              <Tag size={16} /> Category
            </label>
            <Dropdown
              options={categoryOptions}
              selectedValue={categoryId}
              onSelect={(value) => setCategoryId(value)}
              placeholder="Select a category..."
            />
          </div>

          {/* New Category Form (Animated) */}
          <AnimatePresence>
            {showNewCategory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                // --- CHANGE: Themed container ---
                className="space-y-4 p-4 bg-secondary-light dark:bg-secondary-dark rounded-lg border border-border-light dark:border-border-dark overflow-hidden"
              >
                <div>
                  <label htmlFor="new-category-name" className={labelClasses}>
                    <PlusCircle size={16} /> New Category Name
                  </label>
                  <input
                    type="text"
                    id="new-category-name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className={inputClasses}
                    placeholder="e.g., Health & Fitness"
                  />
                </div>
                <div>
                  <label className={labelClasses}>Category Color</label>
                  <ColorPalette
                    selectedColor={newCategoryColor}
                    onColorSelect={setNewCategoryColor}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Target, Unit, and Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="manual-goal-target-value"
                className={labelClasses}
              >
                <Hash size={16} /> Target
              </label>
              <input
                type="number"
                id="manual-goal-target-value"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className={inputClasses}
                placeholder="e.g., 12"
                required
              />
            </div>
            <div>
              <label htmlFor="manual-goal-unit" className={labelClasses}>
                <Ruler size={16} /> Unit
              </label>
              <input
                type="text"
                id="manual-goal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputClasses}
                placeholder="e.g., books"
                required
              />
            </div>
            <div>
              <label htmlFor="manual-goal-targetDate" className={labelClasses}>
                <Calendar size={16} /> Target Date
              </label>
              <input
                id="manual-goal-targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={`${inputClasses} text-text-light-sub dark:text-text-dark-sub`}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            {/* --- CHANGE: Themed cancel button --- */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 rounded-lg bg-tertiary-light dark:bg-tertiary-dark px-4 py-2 font-semibold text-text-light dark:text-text-dark transition-all duration-200 hover:scale-105"
            >
              <X size={18} /> Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md"
              style={{ backgroundColor: themeColor }}
            >
              <Save size={18} /> Save Goal
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ManualGoalModal;
