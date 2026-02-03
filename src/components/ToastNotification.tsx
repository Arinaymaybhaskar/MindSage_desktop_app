import { AnimatePresence, motion } from "framer-motion";
import { Info, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import type { JSX } from "react";

type ToastVariant = "info" | "warning" | "danger" | "success";

interface ToastNotificationProps {
  variant?: ToastVariant;
  message: string;
}

const variantStyles: Record<
  ToastVariant,
  { bg: string; text: string; icon: JSX.Element }
> = {
  info: {
    bg: "bg-secondary-light dark:bg-secondary-dark",
    text: "text-text-light-sub dark:text-text-dark-sub",
    icon: <Info size={16} />,
  },
  warning: {
    bg: "bg-warning/50 dark:bg-warning/60",
    text: "text-text-light dark:text-text-dark",
    icon: <AlertTriangle size={16} />,
  },
  danger: {
    bg: "bg-danger/50 dark:bg-danger/60",
    text: "text-text-light dark:text-text-dark",
    icon: <XCircle size={16} />,
  },
  success: {
    bg: "bg-success/50 dark:bg-success/60",
    text: "text-text-light dark:text-text-dark",
    icon: <CheckCircle size={16} />,
  },
};

const ToastNotification: React.FC<ToastNotificationProps> = ({
  variant = "info",
  message,
}) => {
  const { bg, text, icon } = variantStyles[variant];

  return (
    <AnimatePresence>
      <motion.div
        key="toastNotification"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 0.9, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
        className={`fixed bottom-4 right-4 flex gap-1.5 px-3 py-2 rounded-lg shadow-md text-xs pointer-events-none ${bg} ${text}`}
      >
        {icon}
        <p>{message}</p>
      </motion.div>
    </AnimatePresence>
  );
};

export default ToastNotification;
