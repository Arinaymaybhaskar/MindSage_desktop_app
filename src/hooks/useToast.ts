import { useContext } from "react";
import ToastContext, { type ToastContextType } from "../context/ToastContext";

/**
 * Lives here rather than beside the provider so `ToastContext.tsx` exports
 * only components, which is what React Fast Refresh needs to hot-swap it.
 * Mirrors the `useAuth` / `AuthContext` split.
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};
