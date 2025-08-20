import React from "react";
import Modal from "../../Modal"; // Assuming Modal component is in this path
import { Wand2, Edit3 } from "lucide-react";
import { motion } from "framer-motion";

interface AddGoalChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onManualClick: () => void;
  onAiClick: () => void;
}

const AddGoalChoiceModal: React.FC<AddGoalChoiceModalProps> = ({
  isOpen,
  onClose,
  onManualClick,
  onAiClick,
}) => {
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100 },
    },
  };

  // --- CHANGE: Themed base and hover classes ---
  const cardBaseClasses =
    "p-8 text-center bg-secondary-light dark:bg-secondary-dark rounded-2xl border border-border-light dark:border-border-dark cursor-pointer flex flex-col items-center gap-4 transition-all duration-300 ease-in-out";
  const cardHoverClasses =
    "hover:border-info dark:hover:border-info hover:shadow-2xl hover:-translate-y-2";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a New Goal">
      <div className="text-center mb-8">
        {/* --- CHANGE: Themed text --- */}
        <p className="text-text-light-sub dark:text-text-dark-sub">
          How would you like to get started?
        </p>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: 0.1 }}
      >
        {/* AI Assistant Card */}
        <motion.button
          onClick={onAiClick}
          className={`${cardBaseClasses} ${cardHoverClasses}`}
          variants={cardVariants}
          whileTap={{ scale: 0.98 }}
        >
          {/* --- CHANGE: Themed icon container and color --- */}
          <div className="p-4 bg-tertiary-light dark:bg-tertiary-dark rounded-full">
            <Wand2 size={32} className="text-info" />
          </div>
          <div className="text-content">
            {/* --- CHANGE: Themed text --- */}
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark">
              AI Assistant
            </h3>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
              Let our assistant help you craft well-defined, achievable goals.
            </p>
          </div>
        </motion.button>

        {/* Manual Creation Card */}
        <motion.button
          onClick={onManualClick}
          className={`${cardBaseClasses} ${cardHoverClasses}`}
          variants={cardVariants}
          whileTap={{ scale: 0.98 }}
        >
          {/* --- CHANGE: Themed icon container and color --- */}
          <div className="p-4 bg-tertiary-light dark:bg-tertiary-dark rounded-full">
            <Edit3
              size={32}
              className="text-text-light-sub dark:text-text-dark-sub"
            />
          </div>
          <div className="text-content">
            {/* --- CHANGE: Themed text --- */}
            <h3 className="text-lg font-bold text-text-light dark:text-text-dark">
              Create Manually
            </h3>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
              For when you know exactly what you want. Take control of every
              detail.
            </p>
          </div>
        </motion.button>
      </motion.div>
    </Modal>
  );
};

export default AddGoalChoiceModal;
