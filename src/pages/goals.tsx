import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { goalService } from "../api/goalService";
import { categoryService } from "../api/categoryService";
import type { Category, Goal, ProgressLog } from "../types/Goals";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, Plus } from "lucide-react";

// Import all the polished components
import ManualGoalModal from "../components/goals/modals/ManualGoalModal";
import DeleteConfirmationModal from "../components/goals/modals/DeleteConfirmationModal";
import CategoryFilter from "../components/goals/CategoryFilter";
import CompletedGoalItem from "../components/goals/CompletedGoalItems";
import ReflectionModal from "../components/goals/modals/ReflectionModal";
import GoalCompletedModal from "../components/goals/modals/GoalCompletedModal";
import AddGoalChoiceModal from "../components/goals/modals/AddGoalChoiceModal";
import GoalGeneratorModal from "../components/goals/modals/AIGenerationModal";
import { progressLogsService } from "../api/progressLogsService";
import LogProgressModal from "../components/goals/modals/logProgressModal";
import GoalCardSkeleton from "../components/goals/GoalCardSkeleton";
import ActiveGoalsList from "../components/goals/ActiveGoalsList";
import { qdrantService } from "../api/qdrantService";
import { useLocation, useNavigate } from "react-router-dom";

const GoalsPage: React.FC = () => {
  // All state, data fetching, and handler logic remains the same...
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const location = useLocation();
  const navigate = useNavigate();
  const [isCompletedGoalsOpen, setIsCompletedGoalsOpen] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>();
  const [modalType, setModalType] = useState<
    | "edit"
    | "log"
    | "delete"
    | "reflection"
    | "completed"
    | "addChoice"
    | "AICreate"
    | "manualCreate"
    | null
  >(null);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [active, completed, cats] = await Promise.all([
        goalService.getActiveGoals(authMode, accessToken!),
        goalService.getCompletedGoals(authMode, accessToken!),
        categoryService.getCategories(authMode, accessToken!),
      ]);
      setActiveGoals(Array.isArray(active) ? active : []);
      setCompletedGoals(Array.isArray(completed) ? completed : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (error) {
      console.error("Error fetching data:", error);
      setActiveGoals([]);
      setCompletedGoals([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const filteredActiveGoals = selectedCategory
    ? activeGoals.filter((g) => g.category_id === selectedCategory.id)
    : activeGoals;

  const filteredCompletedGoals = selectedCategory
    ? completedGoals.filter((g) => g.category_id === selectedCategory.id)
    : completedGoals;

  useEffect(() => {
    const pathParts = location.pathname.split("/").filter(Boolean); // ["goals", "create-manual"]
    if (pathParts[0] !== "goals") return;

    switch (pathParts[1]) {
      case "create-manual":
        setModalType("manualCreate");
        break;
      case "create-with-ai":
        setModalType("AICreate");
        break;
      case "category":
        // optionally preselect a category or trigger filter UI
        break;
      default:
        setModalType(null);
    }
  }, [location.pathname]);

  const handleCreateOrUpdateGoal = async (
    goalData: Goal,
    newCategory?: Category
  ) => {
    try {
      let goalAdded;
      if (modalType === "edit") {
        goalAdded = await goalService.updateGoal(
          authMode,
          accessToken!,
          goalData.id,
          goalData
        );
      } else {
        goalAdded = await goalService.addGoal(authMode, accessToken!, goalData);
      }
      console.log(goalAdded, "goalAdded");
      if (goalAdded) {
        await qdrantService.syncGoal(goalAdded.lastInsertRowid);
      }
      closeModal();
      await fetchAllData();
    } catch (error) {
      console.error("Error saving goal:", error);
    }
  };

  const handleDelete = async (goal: Goal) => {
    await goalService.deleteGoal(authMode, accessToken!, goal.id);
    closeModal();
    await fetchAllData();
  };

  const handleComplete = async (goalId: number) => {
    await goalService.completeGoal(authMode, accessToken!, goalId);
    await fetchAllData();
  };

  const handleTogglePin = async (goalId: number) => {
    setActiveGoals((prev) =>
      prev.map((goal) =>
        goal.id === goalId ? { ...goal, is_pinned: !goal.is_pinned } : goal
      )
    );
    try {
      await goalService.togglePin(authMode, accessToken!, goalId.toString());
      await fetchAllData(); // Refetch to confirm state
    } catch (error) {
      console.error("Failed to toggle pin:", error);
      fetchAllData(); // Revert on failure
    }
  };

  const openModal = (type: NonNullable<typeof modalType>, goal?: Goal) => {
    if (goal) setSelectedGoal(goal);
    setModalType(type);
  };

  const closeModal = () => {
    setSelectedGoal(null);
    setModalType(null);
    navigate("/goals", { replace: true });
  };

  const handleLogProgress = async (
    goalId: number,
    value: number,
    description: string
  ) => {
    try {
      const res = await goalService.updateProgress(
        authMode,
        accessToken!,
        goalId,
        value
      );
      let log;
      if (res) {
        log = await progressLogsService.addProgress(
          authMode,
          accessToken!,
          goalId,
          value,
          description
        );
      }
      console.log(log, "log");
      if (log) {
        qdrantService.syncProgressLog(log.id);
      }
      closeModal();
      if (res.target_value === res.current_value) {
        await goalService.completeGoal(authMode, accessToken!, res.id);
        openModal("completed", res);
      }
      await fetchAllData();
    } catch (error) {
      console.error("Failed to log progress:", error);
    }
  };

  const handleViewReflection = async (goal: Goal) => {
    const logs = await progressLogsService.getProgressLogs(
      authMode,
      accessToken!,
      goal.id
    );
    setProgressLogs(logs);
    openModal("reflection", goal);
  };

  return (
    <div className="bg-base-light dark:bg-base-dark text-text-light dark:text-text-dark overflow-y-auto h-full">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight text-text-light dark:text-text-dark">
            Your Goals
          </h1>
          <button
            onClick={() => openModal("addChoice")}
            className="flex items-center gap-2 px-5 py-2.5 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 transition-all duration-200 hover:scale-105"
          >
            <Plus size={20} />
            <span>Add Goal</span>
          </button>
        </header>

        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategorySelect={setSelectedCategory}
        />
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <GoalCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            <ActiveGoalsList
              goals={filteredActiveGoals}
              categories={categories}
              onEdit={(goal) => openModal("edit", goal)}
              onDelete={(goal) => openModal("delete", goal)}
              onLogProgress={(goal) => openModal("log", goal)}
              onTogglePin={handleTogglePin}
              onMarkComplete={handleComplete}
              onAddGoalClick={() => openModal("addChoice")}
            />

            {/* Completed Goals Section */}
            <section className="mt-12 mb-10">
              <div className="flex justify-between items-center mb-2 px-2">
                <h2 className="text-2xl font-semibold text-text-light dark:text-text-dark">
                  Completed Goals
                </h2>
                {filteredCompletedGoals.length > 0 && (
                  <button
                    onClick={() =>
                      setIsCompletedGoalsOpen(!isCompletedGoalsOpen)
                    }
                    className="p-1.5 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                  >
                    <motion.div
                      animate={{ rotate: isCompletedGoalsOpen ? 0 : 180 }}
                    >
                      <ChevronUp size={20} />
                    </motion.div>
                  </button>
                )}
              </div>
              <AnimatePresence>
                {isCompletedGoalsOpen && (
                  <motion.div
                    key="completed-goals-content"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    style={{ overflow: "hidden" }}
                  >
                    {filteredCompletedGoals.length === 0 ? (
                      <p className="text-text-light-sub dark:text-text-dark-sub mt-2 italic px-2">
                        No completed goals yet. Keep going!
                      </p>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {filteredCompletedGoals.map((goal) => (
                          <CompletedGoalItem
                            key={goal.id}
                            goal={goal}
                            onDelete={(goal) => openModal("delete", goal)}
                            onViewReflection={() => handleViewReflection(goal)}
                          />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </>
        )}
      </main>

      <AnimatePresence>
        {modalType === "manualCreate" && (
          <ManualGoalModal
            mode="create"
            isOpen
            onClose={closeModal}
            onSubmit={handleCreateOrUpdateGoal}
            initialData={null}
            categories={categories}
          />
        )}
        {modalType === "edit" && selectedGoal && (
          <ManualGoalModal
            mode="edit"
            isOpen
            onClose={closeModal}
            onSubmit={handleCreateOrUpdateGoal}
            initialData={selectedGoal}
            categories={categories}
          />
        )}
        {modalType === "log" && selectedGoal && (
          <LogProgressModal
            isOpen
            onClose={closeModal}
            goal={selectedGoal}
            category={categories.find((c) => c.id === selectedGoal.category_id)}
            onSubmit={handleLogProgress}
          />
        )}
        {modalType === "addChoice" && (
          <AddGoalChoiceModal
            isOpen
            onClose={closeModal}
            onManualClick={() => {
              closeModal();
              openModal("manualCreate");
            }}
            onAiClick={() => {
              closeModal();
              openModal("AICreate");
            }}
          />
        )}
        {modalType === "AICreate" && (
          <GoalGeneratorModal
            isOpen
            onClose={closeModal}
            categories={categories}
            onSubmit={handleCreateOrUpdateGoal}
          />
        )}
        {modalType === "delete" && selectedGoal && (
          <DeleteConfirmationModal
            isOpen
            onClose={closeModal}
            onConfirm={() => handleDelete(selectedGoal)}
            type={"journal"}
          />
        )}
        {modalType === "reflection" && selectedGoal && (
          <ReflectionModal
            isOpen
            onClose={closeModal}
            goal={{ ...selectedGoal, progressLogs: progressLogs }}
          />
        )}
        {modalType === "completed" && selectedGoal && (
          <GoalCompletedModal
            isOpen
            onClose={closeModal}
            goalTitle={selectedGoal.title}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default GoalsPage;
