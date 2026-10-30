import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { SETUP_COMPLETE_KEY } from "../pages/Onboarding";

/**
 * First-run gate: once a profile is signed in and setup hasn't been done,
 * send it to the AI setup flow. Waiting for the sign-in keeps the order
 * Profile, then Local AI, then You're set (KAN-470). Skippable: Onboarding
 * sets SETUP_COMPLETE_KEY on Skip/Finish, so it never loops.
 */
export default function SetupGate() {
  const { user, checking } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (
      !checking &&
      user &&
      window.electron?.ipcRenderer &&
      localStorage.getItem(SETUP_COMPLETE_KEY) !== "1" &&
      pathname !== "/setup" &&
      pathname !== "/quick-capture"
    ) {
      navigate("/setup", { replace: true });
    }
    // Only a sign-in should trigger it, not every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, checking]);

  return null;
}
