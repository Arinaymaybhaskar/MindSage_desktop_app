// ToastContext.tsx
import React, { createContext, useState, type ReactNode, useCallback } from "react";
import ToastNotification from "../components/ToastNotification";

type ToastVariant = "info" | "warning" | "danger" | "success";

interface Toast {
  id: number;
  message: string;
  variant?: ToastVariant;
}

export interface ToastContextType {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let toastId = 0;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, variant }]);

      // Remove toast after 3 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            variant={toast.variant}
            message={toast.message}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastContext;
