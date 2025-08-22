import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  HashRouter,
} from "react-router-dom";
import Login from "./pages/auth/login";
import PrivateRoute from "./routes/privateRoute";
import Dashboard from "./pages/dashBoard";
import Register from "./pages/auth/register";
import Navbar from "./components/navbar";
import JournalList from "./pages/journalList";
import JournalForm from "./pages/journalForm";
import JournalDetail from "./pages/journalDetails";
import DailyChallenge from "./pages/dailyChallenge";
import Settings from "./pages/settings";
import ChangePassword from "./pages/auth/changePassword";
import { DeleteAccount } from "./pages/auth/deleteAccount";
import ForgotPassword from "./pages/auth/forgotPassword";
import DataExport from "./pages/dataExport";
import { ChatComponent } from "./pages/chat";
import TitleBar from "./TitleBar";
import {
  BookOpenIcon,
  HomeIcon,
  MessageSquareDot,
  PenIcon,
  Target,
  TrophyIcon,
} from "lucide-react";
import Dock from "./components/dock";
import GoalsPage from "./pages/goals";
import OllamaTutorialPage from "./pages/OllamaTutorial";

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthPage =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/ollama-tutorial";

  // CHANGED: Updated the paths for the dock items.
  // "Write" now points to the root "/" and "Dashboard" points to "/dashboard".
  const items = [
    { path: "/dashboard", icon: <HomeIcon size={18} />, label: "Dashboard" },
    { path: "/", icon: <PenIcon size={18} />, label: "Write" },
    { path: "/journals", icon: <BookOpenIcon size={18} />, label: "Journals" },
    {
      path: "/daily-challenge",
      icon: <TrophyIcon size={18} />,
      label: "Daily Challenge",
    },
    { path: "/chat", icon: <MessageSquareDot size={18} />, label: "Chat" },
    { path: "/goals", icon: <Target size={18} />, label: "Goals" },
  ].map((item) => ({
    ...item,
    onClick: () => navigate(item.path),
  }));

  return (
    <>
      <div className="relative z-[9999]">
        <TitleBar />
      </div>
      <div
        className={`flex h-screen font-inter bg-gradient-to-b from-base-light to-white dark:from-base-dark dark:to-[hsl(0,0%,12%)]`}
      >
        {!isAuthPage && (
          <Dock
            items={items}
            panelHeight={30}
            baseItemSize={40}
            magnification={80}
          />
        )}
        <div className={`flex flex-col h-screen w-full overflow-hidden pt-15`}>
          {/* {!isAuthPage && <Navbar />} */}
          <main className="flex-1 overflow-y-auto  no-scrollbar">
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
              <Route path="/register" element={<Register />} />
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
                path="/daily-challenge"
                element={
                  <PrivateRoute>
                    <DailyChallenge />
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
                path="/delete-account"
                element={
                  <PrivateRoute>
                    <DeleteAccount />
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
                path="/chat"
                element={
                  <PrivateRoute>
                    <ChatComponent />
                  </PrivateRoute>
                }
              />
              <Route path="/ollama-tutorial" element={<OllamaTutorialPage />} />
              <Route
                path="/goals"
                element={
                  <PrivateRoute>
                    <GoalsPage />
                  </PrivateRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </>
  );
}

function App() {
  // Use Vite's build flag so the router choice is correct in the production bundle
  // const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}

export default App;
