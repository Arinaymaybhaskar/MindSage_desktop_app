import React, { useMemo, useState } from "react";
import Modal from "../../Modal";
import { AmbitionNamePrompt, getGoalPrompt } from "../../../utils/prompts/goal";
import { ollamaService } from "../../../api/ollamaService";
import { useAuth } from "../../../hooks/useAuth";
import type { Category } from "../../../types/Goals";
import {
  BrainCircuit,
  Sparkles,
  Trash2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type GeneratedGoal = {
  title: string;
  description?: string;
  category_id: string | number | "";
  target_value: number | string;
  unit: string;
  target_date?: string;
};

interface GoalGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (goalData: any) => void;
}

// A simple spinner component for loading states
const Loader = () => (
  <motion.div
    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
  />
);

const GoalGeneratorModal: React.FC<GoalGeneratorModalProps> = ({
  isOpen,
  onClose,
  categories,
  onSubmit,
}) => {
  const [ambition, setAmbition] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [goals, setGoals] = useState<GeneratedGoal[]>([]);
  const [error, setError] = useState("");
  const { accessToken } = useAuth();
  const selectedModel =
    typeof window !== "undefined" ? localStorage.getItem("selectedModel") : "";

  const categoryIndexByName = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.name.toLowerCase(), c));
    return map;
  }, [categories]);

  const normalizeAIResponseToGoals = (raw: any): GeneratedGoal[] => {
    const formatDateForInput = (dateStr?: string): string => {
      if (!dateStr || typeof dateStr !== "string") return "";
      // Handles DD-MM-YYYY format from the AI
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const [day, month, year] = parts;
        // Ensure parts are valid before formatting to avoid invalid dates
        if (day.length === 2 && month.length === 2 && year.length === 4) {
          return `${year}-${month}-${day}`;
        }
      }
      // Return original string if it's not in the expected DD-MM-YYYY format
      // It might already be correct, or it's another invalid format.
      return dateStr;
    };

    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((g: any) => {
      const aiCategoryName =
        typeof g.category === "string" ? g.category.trim().toLowerCase() : "";
      const resolvedCategoryId =
        categoryIndexByName.get(aiCategoryName)?.id || "";
      return {
        title: g.title ?? "",
        description: g.description ?? "",
        category_id: resolvedCategoryId,
        target_value: g.target_value ?? "",
        unit: g.unit ?? "",
        target_date: formatDateForInput(g.target_date) ?? "",
      };
    });
  };

  const handleGenerateGoals = async () => {
    if (!ambition.trim() || !selectedModel) return;
    setIsLoading(true);
    setError("");

    try {
      const prompt = getGoalPrompt(ambition, categories);
      const res = await ollamaService.getResponse(
        accessToken!,
        selectedModel,
        prompt
      );
      const ambitionPrompt = AmbitionNamePrompt(ambition);
      const ambitionRes = await ollamaService.getResponse(
        accessToken!,
        selectedModel,
        ambitionPrompt
      );

      if (ambitionRes) setAmbition(ambitionRes);

      const cleaned = (res as string)
        .replace(/^\s*```(?:json)?|```\s*$/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      const normalized = normalizeAIResponseToGoals(parsed);
      console.log(normalized, goals);
      setGoals(normalized);
    } catch (err) {
      console.error("Error generating goals:", err);
      setError(
        "The AI failed to generate valid goals. Please try refining your ambition."
      );
      setGoals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (
    index: number,
    field: keyof GeneratedGoal,
    value: any
  ) => {
    const newGoals = [...goals];
    newGoals[index] = { ...newGoals[index], [field]: value };
    setGoals(newGoals);
  };

  const handleRemoveGoal = (index: number) => {
    setGoals((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitAll = () => {
    // Basic validation
    if (
      goals.some(
        (g) => !g.title || !g.category_id || g.target_value === "" || !g.unit
      )
    ) {
      alert(
        "Please ensure every goal has a Title, Category, Target, and Unit."
      );
      return;
    }

    goals.forEach((g) =>
      onSubmit({
        ...g,
        category_id: Number(g.category_id),
        target_value: Number(g.target_value),
        parent_goal_title: ambition,
        is_pinned: false,
      })
    );
    onClose();
  };

  const getCategoryColor = (categoryId: string | number) => {
    return (
      categories.find((c) => String(c.id) === String(categoryId))?.color ||
      "#6B7280"
    );
  };

  // Common input styling
  const inputClasses =
    "w-full p-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition";

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={goals.length ? "3xl" : "lg"}>
      {!goals.length ? (
        // Step 1: Ambition Input
        <div className="flex flex-col items-center text-center gap-4 p-4">
          <div className="p-4 bg-indigo-100 dark:bg-indigo-500/10 rounded-full">
            <BrainCircuit
              size={40}
              className="text-indigo-600 dark:text-indigo-400"
            />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Describe Your Ambition
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Tell the AI what you want to achieve, and it will break it down into
            smaller, actionable goals for you.
          </p>
          {error && (
            <div className="w-full flex gap-2 text-start text-sm text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/20 rounded-lg p-3">
              <AlertTriangle size={20} /> {error}
            </div>
          )}
          <textarea
            className={`${inputClasses} text-center text-base`}
            placeholder="e.g., 'Get fit and run a 5K race in three months'"
            value={ambition}
            onChange={(e) => setAmbition(e.target.value)}
            rows={3}
          />
          <button
            onClick={handleGenerateGoals}
            disabled={isLoading || !ambition.trim()}
            className="w-full flex items-center justify-center gap-3 mt-2 px-4 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? <Loader /> : <Sparkles size={20} />}
            <span>{isLoading ? "Generating..." : "Generate Goals"}</span>
          </button>
        </div>
      ) : (
        // Step 2: Review Suggestions
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Review Your AI-Generated Goals
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              For your ambition:{" "}
              <span className="font-semibold text-indigo-500">{ambition}</span>
            </p>
          </div>
          <motion.div
            layout
            className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 space-y-4"
          >
            <AnimatePresence>
              {goals.map((goal, idx) => (
                <motion.div
                  layout
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50, transition: { duration: 0.2 } }}
                  className="relative rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 pl-6 shadow-sm"
                >
                  <div
                    className="absolute left-0 top-0 h-full w-1.5 rounded-l-lg"
                    style={{
                      backgroundColor: getCategoryColor(goal.category_id),
                    }}
                  />
                  <button
                    onClick={() => handleRemoveGoal(idx)}
                    className="absolute right-2 top-2 p-1.5 rounded-full text-gray-400 hover:bg-red-100 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-500 transition-colors"
                    aria-label="Remove goal"
                  >
                    <Trash2 size={16} />
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        value={goal.title}
                        onChange={(e) =>
                          handleFieldChange(idx, "title", e.target.value)
                        }
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Category
                      </label>
                      <select
                        value={goal.category_id}
                        onChange={(e) =>
                          handleFieldChange(idx, "category_id", e.target.value)
                        }
                        className={inputClasses}
                      >
                        <option value="">Select...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-1">
                      Description
                    </label>
                    <textarea
                      value={goal.description}
                      onChange={(e) =>
                        handleFieldChange(idx, "description", e.target.value)
                      }
                      className={inputClasses}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Target
                      </label>
                      <input
                        type="number"
                        value={goal.target_value}
                        onChange={(e) =>
                          handleFieldChange(idx, "target_value", e.target.value)
                        }
                        className={inputClasses}
                        placeholder="e.g., 150"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={goal.unit}
                        onChange={(e) =>
                          handleFieldChange(idx, "unit", e.target.value)
                        }
                        className={inputClasses}
                        placeholder="e.g., minutes"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Target Date
                      </label>
                      <input
                        type="date"
                        value={goal.target_date || ""}
                        onChange={(e) =>
                          handleFieldChange(idx, "target_date", e.target.value)
                        }
                        className={`${inputClasses} text-gray-500`}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          <button
            onClick={handleSubmitAll}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition"
          >
            <Check size={20} />
            Add These Goals
          </button>
        </div>
      )}
    </Modal>
  );
};

export default GoalGeneratorModal;
