import React from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "../../Modal"; // Using the themed base Modal

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  type: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  type,
}) => {
  // We can now use the main Modal component as the wrapper
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Move ${type} to trash`}
      size="sm"
    >
      <div className="text-center">
        {/* --- CHANGE: Themed icon and container --- */}
        <div className="mx-auto flex w-12 items-center justify-center rounded-full bg-danger/10">
          <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
        </div>
        <div className="mt-4">
          <div className="mt-2">
            {/* --- CHANGE: Themed text --- */}
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              This {type} moves to the Trash and is kept for 30 days. You can
              restore it from the Trash until then; after that it is removed for
              good.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {/* --- CHANGE: Themed delete button --- */}
        <button
          type="button"
          onClick={onConfirm}
          className="w-full inline-flex justify-center rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-danger/90 transition-colors"
        >
          Move to trash
        </button>
        {/* --- CHANGE: Themed cancel button --- */}
        <button
          type="button"
          onClick={onClose}
          className="w-full inline-flex justify-center rounded-lg bg-tertiary-light dark:bg-tertiary-dark px-4 py-2.5 text-sm font-semibold text-text-light dark:text-text-dark shadow-sm hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
};

export default DeleteConfirmationModal;
