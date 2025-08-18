import React, { useState, useEffect } from "react";
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
  const [newCategoryColor, setNewCategoryColor] = useState("#4ade80"); // Default to a nice green

  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const themeColor =
    categories.find((c) => c.id === categoryId)?.color || "#6366F1";

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

  const inputClasses =
    "w-full p-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition";
  const labelClasses =
    "flex items-center gap-2 mb-2 text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "edit" ? "Edit Goal" : "Create a New Goal"}
    >
      <div className="text-gray-800 dark:text-gray-100">
        {/* <div
          className="p-4 rounded-t-lg mb-6 -m-6 text-white"
          style={{ backgroundColor: themeColor }}
        >
          <h2 className="text-xl font-bold text-center">
            {mode === "edit" ? "Edit Goal" : "Create a New Goal"}
          </h2>
        </div> */}
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

          {/* Category Selection */}
          <div>
            <label htmlFor="manual-goal-category" className={labelClasses}>
              <Tag size={16} /> Category
            </label>
            <select
              id="manual-goal-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClasses}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
              <option value="add_new">✨ Add New Category...</option>
            </select>
          </div>

          {/* New Category Form (Animated) */}
          <AnimatePresence>
            {showNewCategory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
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
                className={`${inputClasses} text-gray-500`}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 rounded-lg bg-gray-200 dark:bg-gray-600 px-4 py-2 font-semibold text-gray-700 dark:text-gray-200 transition-transform duration-200 hover:scale-105"
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
