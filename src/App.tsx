import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/auth/login";
import PrivateRoute from "./routes/privateRoute";
import Dashboard from "./pages/dashBoard";
import Register from "./pages/auth/register";
import Navbar from "./components/navbar";
import JournalList from "./pages/journalList";
import JournalForm from "./pages/journalForm";
import JournalDetail from "./pages/journalDetails";
import DailyChallenge from "./pages/dailyChallenge";
import Sidebar from "./components/sidebar";
import Settings from "./pages/settings";
import ChangePassword from "./pages/auth/changePassword";
import { DeleteAccount } from "./pages/auth/deleteAccount";
import ForgotPassword from "./pages/auth/forgotPassword";
import DataExport from "./pages/dataExport";
import { ChatComponent } from "./pages/chat";
function AppLayout() {
  const location = useLocation();
  const isAuthPage =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password";

  // const settings = localStorage.getItem("userSettings");
  // let fontSize = "text-base";
  // let theme = "light";
  // if (settings) {
  //   const parsedSettings = JSON.parse(settings);
  //   switch (parsedSettings.font_size) {
  //     case "small":
  //       fontSize = "text-sm";
  //       break;
  //     case "medium":
  //       fontSize = "text-base";
  //       break;
  //     case "large":
  //       fontSize = "text-lg";
  //       break;
  //     case "x-large":
  //       fontSize = "text-xl";
  //       break;
  //     default:
  //       fontSize = "text-base";
  //   }
  //   theme = parsedSettings.theme || "light";
  // }

  return (
    <div className={`flex h-screen font-[fraunces] bg-gray-50`}>
      {!isAuthPage && <Sidebar />}
      <div
        className={`flex flex-col h-screen  w-full overflow-hidden`}
      >
        {!isAuthPage && <Navbar />}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100">
          <Routes>
            <Route
              path="/journals"
              element={
                <PrivateRoute>
                  <JournalList />
                </PrivateRoute>
              }
            />
            <Route
              path="/journal/new"
              element={
                <PrivateRoute>
                  <JournalForm />
                </PrivateRoute>
              }
            />
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
            <Route
              path="/"
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
              path="/settings"
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
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
