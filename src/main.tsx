import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { RootErrorFallback } from "./components/ErrorFallback";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Outside AuthProvider on purpose: it JSON.parses stored user info in a
        lazy initializer, so one corrupt value white-screens the app before
        anything renders. */}
    <ErrorBoundary fallback={(state) => <RootErrorFallback {...state} />}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
