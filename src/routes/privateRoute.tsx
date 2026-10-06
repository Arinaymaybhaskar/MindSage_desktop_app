import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { JSX } from "react";

export default function PrivateRoute({ children }: { children: JSX.Element }) {
  const { user, checking } = useAuth();

  // Wait for the main process to say who is signed in, or a remembered
  // session would flash the login screen on every launch.
  if (checking) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
