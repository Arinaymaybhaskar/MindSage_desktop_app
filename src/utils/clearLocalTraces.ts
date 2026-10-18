import { SETUP_COMPLETE_KEY } from "../pages/Onboarding";

/** Everything a deleted profile leaves behind in the browser's own storage. */
export function clearLocalTraces(lastProfile: boolean) {
  try {
    localStorage.removeItem("userInfo");
    if (lastProfile) {
      // Draft keys are not per profile, so another profile's unsaved draft
      // could be among them; they go only when nobody else is left.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("draft-")) localStorage.removeItem(key);
      }
      localStorage.removeItem(SETUP_COMPLETE_KEY);
    }
  } catch {
    // Storage can be unavailable; the main process has already deleted the data.
  }
}
