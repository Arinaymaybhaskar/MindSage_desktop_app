import { SETUP_COMPLETE_KEY } from "../pages/Onboarding";

/** Everything a deleted profile leaves behind in the browser's own storage. */
export function clearLocalTraces(lastProfile: boolean) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("draft-")) localStorage.removeItem(key);
    }
    localStorage.removeItem("userInfo");
    if (lastProfile) localStorage.removeItem(SETUP_COMPLETE_KEY);
  } catch {
    // Storage can be unavailable; the main process has already deleted the data.
  }
}
