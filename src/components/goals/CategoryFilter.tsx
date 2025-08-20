import React from "react";
import type { Category } from "../../types/Goals";
import { Tag } from "lucide-react";
import { getContrastingTextColor } from "../../utils/contrastingColor";
import clsx from "clsx";

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: Category | null;
  onCategorySelect: (category: Category | null) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategory,
  onCategorySelect,
}) => {
  const baseClasses =
    "px-4 py-2 text-sm font-semibold rounded-full transition-all duration-300 ease-in-out transform hover:scale-105";

  // --- CHANGE: Themed classes for inactive buttons ---
  const inactiveClasses =
    "bg-secondary-light text-text-light-sub hover:bg-tertiary-light dark:bg-secondary-dark dark:text-text-dark-sub dark:hover:bg-tertiary-dark";

  return (
    <div className="mb-8">
      {/* --- CHANGE: Themed label --- */}
      <label className="flex items-center gap-2 mb-4 text-md font-semibold text-text-light dark:text-text-dark">
        <Tag size={20} className="text-info" />
        <span>Filter by Category</span>
      </label>

      <div className="flex flex-wrap gap-3">
        {/* "All Categories" Button */}
        <button
          onClick={() => onCategorySelect(null)}
          className={clsx(baseClasses, {
            // --- CHANGE: Themed selected state ---
            "bg-info text-white shadow-md": !selectedCategory,
            [inactiveClasses]: selectedCategory,
          })}
        >
          All
        </button>

        {/* Individual Category Buttons */}
        {categories.map((cat) => {
          const isSelected = selectedCategory?.id === cat.id;
          const textColor = isSelected
            ? getContrastingTextColor(cat.color)
            : "";

          return (
            <button
              key={cat.id}
              onClick={() => onCategorySelect(cat)}
              className={clsx(baseClasses, {
                [inactiveClasses]: !isSelected,
              })}
              style={
                isSelected
                  ? {
                      backgroundColor: cat.color,
                      color: textColor,
                      boxShadow: `0 4px 14px 0 ${cat.color}60`,
                    }
                  : {}
              }
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryFilter;
