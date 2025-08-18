import React from "react";
import type { Category } from "../../types/Goals";
import { Tag } from "lucide-react";
import { getContrastingTextColor } from "../../utils/contrastingColor";

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

  return (
    <div className="mb-8">
      <label className="flex items-center gap-2 mb-4 text-md font-semibold text-gray-800 dark:text-gray-200">
        <Tag size={20} />
        <span>Filter by Category</span>
      </label>

      <div className="flex flex-wrap gap-3">
        {/* "All Categories" Button */}
        <button
          onClick={() => onCategorySelect(null)}
          className={`${baseClasses} ${
            !selectedCategory
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          }`}
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
              className={`${baseClasses} ${
                !isSelected &&
                "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: cat.color,
                      color: textColor,
                      boxShadow: `0 4px 14px 0 ${cat.color}60`, // Adds a colored glow
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
