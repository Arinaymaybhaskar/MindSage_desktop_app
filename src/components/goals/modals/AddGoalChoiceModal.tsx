import React from "react";
import Modal from "../../Modal";
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

  const cardBaseClasses =
    "p-8 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 cursor-pointer flex flex-col items-center gap-4 transition-all duration-300 ease-in-out";
  const cardHoverClasses =
    "hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-2xl hover:-translate-y-2";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add a New Goal">
      <div className="text-center mb-8">
        <p className="text-gray-600 dark:text-gray-400">
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
          <div className="p-4 bg-indigo-100 dark:bg-indigo-500/10 rounded-full">
            <Wand2 size={32} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-content">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              AI Assistant
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
          <div className="p-4 bg-gray-100 dark:bg-gray-700/60 rounded-full">
            <Edit3 size={32} className="text-gray-700 dark:text-gray-300" />
          </div>
          <div className="text-content">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Create Manually
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
