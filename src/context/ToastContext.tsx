// ToastContext.tsx
import React, {
  createContext,
  useState,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AnimatePresence } from "framer-motion";
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

/** How many toasts may be on screen at once; the oldest are dropped first. */
const MAX_VISIBLE = 3;
const TOAST_DURATION = 3000;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    const pending = timers.current;
    const keys = seen.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
      keys.clear();
    };
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const key = `${variant}:${message}`;

      // Two code paths often report the same failure (the awaited IPC result
      // and the ai-status-event broadcast). Restart the visible toast's timer
      // instead of stacking a second copy of the same text.
      const existing = seen.current.get(key);
      const id = existing ?? ++toastId;

      if (existing === undefined) {
        setToasts((prev) => {
          const next = [...prev, { id, message, variant }];
          // Drop the oldest overflow, along with its timer and dedupe entry.
          for (const dropped of next.slice(0, -MAX_VISIBLE)) {
            const timer = timers.current.get(dropped.id);
            if (timer) clearTimeout(timer);
            timers.current.delete(dropped.id);
            seen.current.delete(`${dropped.variant}:${dropped.message}`);
          }
          return next.slice(-MAX_VISIBLE);
        });
        seen.current.set(key, id);
      } else {
        clearTimeout(timers.current.get(id));
      }

      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          seen.current.delete(key);
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, TOAST_DURATION),
      );
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2 z-50 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              variant={toast.variant}
              message={toast.message}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export default ToastContext;
