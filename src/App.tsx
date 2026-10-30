import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  HashRouter,
  Navigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import Login from "./pages/auth/login";
import Profiles from "./pages/auth/profiles";
import PrivateRoute from "./routes/privateRoute";
import Dashboard from "./pages/dashBoard";
import Register from "./pages/auth/register";
import JournalList from "./pages/journalList";
import JournalForm from "./pages/journalForm";
import JournalDetail from "./pages/journalDetails";
import Settings from "./pages/settings";
import ChangePassword from "./pages/auth/changePassword";
import DeleteProfileDialog from "./components/DeleteProfileDialog";
import ForgotPassword from "./pages/auth/forgotPassword";
import DataExport from "./pages/dataExport";
import { ChatPage } from "./pages/chat";
import TitleBar from "./components/TitleBar";
import {
  BookOpenIcon,
  HomeIcon,
  MessageSquareDot,
  PenIcon,
  Target,
  Users,
} from "lucide-react";
import Dock from "./components/dock";
import GoalsPage from "./pages/goals";
import PeoplePage from "./pages/people";
import PersonDetail from "./pages/personDetail";
import { ColorThemeProvider } from "./context/ColorThemeContext";
import { initializeColors } from "./utils/colorInitializer";
import GoalDetail from "./pages/goalDetail";
import GlobalSearch from "./components/GlobalSearch";
import Memories from "./pages/Memories";
import Trash from "./pages/Trash";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import QuickCapture from "./components/quickCapture";
import NotFoundPage from "./pages/NotFoundPage";
import Onboarding from "./pages/Onboarding";
import SetupGate from "./components/SetupGate";
import YoureSet from "./pages/YoureSet";
import AIReadinessBanner from "./components/AIReadinessBanner";
import AIStatusCard from "./components/AIStatusCard";
import CudaOfferPrompt from "./components/CudaOfferPrompt";
import UpdateBar from "./components/UpdateBar";
import { ToastProvider } from "./context/ToastContext";
import ErrorBoundary from "./components/ErrorBoundary";
import ErrorFallback from "./components/ErrorFallback";

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);
  const [showKeyboardModal, setShowKeyboardModal] = useState(false);

  const isQuickCapturePage = location.pathname === "/quick-capture";

  // Readiness marker for Playwright-driven screenshot and demo-video runs.
  // Startup is slow and staged (database, Ollama models, the search index,
  // then IPC and the worker), so automation needs a real signal rather than a
  // fixed sleep - the whole sequence can take 10-30s on a cold start.
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;
    const unsubscribe = window.electron.ipcRenderer.on("services-ready", () => {
      document.body.dataset.appReady = "true";
    });
    return () => unsubscribe?.();
  }, []);

  // Tell the main process this window has actually painted, so it can hold
  // the splash screen up until there is real UI to reveal instead of a blank
  // white frame - see the "renderer:visually-ready" handshake in main.js.
  // Two nested rAFs land after the browser's next paint, not just after
  // React's commit.
  useEffect(() => {
    if (isQuickCapturePage || !window.electron?.send) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) window.electron.send("renderer:visually-ready");
      });
    });
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "f") {
          e.preventDefault(); // block browser's find
          setShowSearch(true);
        }
        if (e.key.toLowerCase() === "n") {
          e.preventDefault(); // block browser's new window
          navigate("/journal/new", { replace: true });
        }
        if (e.key.toLowerCase() === ",") {
          e.preventDefault();
          navigate("/settings");
        }
        if (e.key.toLowerCase() === ".") {
          e.preventDefault();
          setShowKeyboardModal(true);
        }
      } else if (e.key === "Escape") {
        setShowSearch(false);
      }
      if (e.key === "Backspace") {
        const activeElement = document.activeElement as HTMLElement;
        if (
          activeElement &&
          (activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA" ||
            activeElement.isContentEditable)
        ) {
          // Let the event propagate if the focus is on an input, textarea, or contenteditable element
          return;
        }
        e.preventDefault();
        navigate(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
  const isAuthPage =
    location.pathname === "/login" ||
    location.pathname === "/profiles" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/setup";

  // CHANGED: Updated the paths for the dock items.
  // "Write" now points to the root "/" and "Dashboard" points to "/dashboard".
  const items = [
    { path: "/dashboard", icon: <HomeIcon size={18} />, label: "Dashboard" },
    { path: "/", icon: <PenIcon size={18} />, label: "Write" },
    { path: "/journals", icon: <BookOpenIcon size={18} />, label: "Journals" },

    { path: "/chat", icon: <MessageSquareDot size={18} />, label: "Chat" },
    { path: "/goals", icon: <Target size={18} />, label: "Goals" },
    { path: "/people", icon: <Users size={18} />, label: "People" },
  ].map((item) => ({
    ...item,
    onClick: () => navigate(item.path),
  }));

  return (
    <>
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
      {showKeyboardModal && (
        <KeyboardShortcutsModal
          isOpen={showKeyboardModal}
          onClose={() => setShowKeyboardModal(false)}
        />
      )}

      {!isQuickCapturePage && (
        <div className="relative z-[9999]">
          <TitleBar />
        </div>
      )}
      <div className={`flex h-screen font-inter`}>
        {!isQuickCapturePage && !isAuthPage && (
          <Dock
            items={items}
            panelHeight={30}
            baseItemSize={40}
            magnification={80}
          />
        )}
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* The title bar is fixed over the top 40px, so notices start below
              it, and <main> only needs its own top padding while there are
              none (the wrapper is :empty then, and hidden). */}
          <div className="peer pt-10 empty:hidden">
            {!isQuickCapturePage && !isAuthPage && <UpdateBar />}
            {!isQuickCapturePage && !isAuthPage && <AIReadinessBanner />}
          </div>
          {!isQuickCapturePage && !isAuthPage && (
            <div className="fixed bottom-3 left-3 z-40 max-w-60">
              <AIStatusCard />
              <CudaOfferPrompt />
            </div>
          )}
          {/* Outside the routes: deleting a profile signs the person out, and
              its "deleted" screen has to survive that. */}
          {!isQuickCapturePage && <DeleteProfileDialog />}
          <SetupGate />
          <main
            className={`flex-1 overflow-hidden no-scrollbar ${
              isQuickCapturePage ? "" : "peer-empty:pt-10"
            }`}
          >
            {/* Wraps the routes only, so a page crash leaves the title bar,
                the dock and AppLayout's mount effects intact, the splash
                handshake among them. Keyed on the path so navigating away
                clears the error instead of latching on it. */}
            <ErrorBoundary
              key={location.pathname}
              fallback={(state) => <ErrorFallback {...state} variant="route" />}
            >
              <Routes>
                <Route
                  path="/journals"
                  element={
                    <PrivateRoute>
                      <JournalList />
                    </PrivateRoute>
                  }
                />
                {/* REMOVED: The old "/journal/new" route is no longer needed as "/" now handles it. */}
                <Route
                  path="/journal/edit/:id"
                  element={
                    <PrivateRoute>
                      <JournalForm />
                    </PrivateRoute>
                  }
                />
                {/* Linked from the dashboard, so a real signed-in feature. */}
                <Route
                  path="/memories"
                  element={
                    <PrivateRoute>
                      <Memories />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/trash"
                  element={
                    <PrivateRoute>
                      <Trash />
                    </PrivateRoute>
                  }
                />
                <Route path="/register" element={<Register />} />
                <Route path="/profiles" element={<Profiles />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                {/* CHANGED: The root path "/" now renders JournalForm. */}
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <JournalForm />
                    </PrivateRoute>
                  }
                />
                <Route path="/quick-capture" element={<QuickCapture />} />

                <Route
                  path="/journal/new"
                  element={
                    <PrivateRoute>
                      <JournalForm />
                    </PrivateRoute>
                  }
                />
                {/* ADDED: A new route for the Dashboard. */}
                <Route
                  path="/dashboard"
                  element={
                    <PrivateRoute>
                      <Dashboard />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/journal/view/:id"
                  element={
                    <PrivateRoute>
                      <JournalDetail />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/settings/*"
                  element={
                    <PrivateRoute>
                      <Settings />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/change-password"
                  element={
                    <PrivateRoute>
                      <ChangePassword />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/data-export"
                  element={
                    <PrivateRoute>
                      <DataExport />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/people"
                  element={
                    <PrivateRoute>
                      <PeoplePage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/people/:id"
                  element={
                    <PrivateRoute>
                      <PersonDetail />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <PrivateRoute>
                      <ChatPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/ollama-tutorial"
                  element={<Navigate to="/settings/models" replace />}
                />
                <Route
                  path="/qdrant"
                  element={<Navigate to="/settings/models" replace />}
                />
                <Route path="/setup" element={<Onboarding />} />
                <Route path="/youre-set" element={<YoureSet />} />
                <Route
                  path="/goals/view/:id"
                  element={
                    <PrivateRoute>
                      <GoalDetail />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/goals/*"
                  element={
                    <PrivateRoute>
                      <GoalsPage />
                    </PrivateRoute>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}

function App() {
  // Initialize colors on app startup
  useEffect(() => {
    initializeColors();
  }, []);
  useEffect(() => {
    const savedZoom = localStorage.getItem("zoom_scale");
    if (savedZoom && window.electron?.zoom) {
      window.electron.zoom.set(parseInt(savedZoom, 10) / 100);
    }
  }, []);

  // Use Vite's build flag so the router choice is correct in the production bundle
  // const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;
  return (
    <ColorThemeProvider>
      <ToastProvider>
        <HashRouter>
          <AppLayout />
        </HashRouter>
      </ToastProvider>
    </ColorThemeProvider>
  );
}

export default App;
