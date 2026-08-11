import { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";
import { Switch } from "../ui/Switch";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

// Apply the zoom through the preload bridge. `window.require` is unavailable
// under contextIsolation, so the old webFrame lookup silently no-op'd — which
// is why zoom used to only take effect after a reload (App.tsx re-applies it
// from localStorage on startup via this same bridge).
const applyZoom = (percent: number) => {
  window.electron?.zoom?.set(percent / 100);
};

export const PathOnTitlebar = () => {
  const [localSettings, setLocalSettings] = useState({
    path_on_titlebar: false,
  });

  const settings = JSON.parse(localStorage.getItem("settings") || "{}");

  useEffect(() => {
    const storedPathSetting = localStorage.getItem("path_on_titlebar");
    setLocalSettings({
      path_on_titlebar:
        storedPathSetting !== null
          ? JSON.parse(storedPathSetting)
          : settings?.path_on_titlebar || false,
    });
  }, []);

  const handleChange = (name: string, value: boolean) => {
    setLocalSettings((prev) => ({ ...prev, [name]: value }));
    if (name === "path_on_titlebar") {
      localStorage.setItem(name, JSON.stringify(value));
      // Notify the TitleBar (same window) to update live. The native `storage`
      // event only fires in *other* windows, so we dispatch our own — no reload.
      window.dispatchEvent(
        new CustomEvent("path_on_titlebar-changed", { detail: value }),
      );
    }
  };

  return (
    <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
      <div>
        <label className="font-medium text-text-light dark:text-text-dark">
          Path on Titlebar
        </label>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Show the current path in the titlebar for easy navigation.
        </p>
      </div>
      <Switch
        checked={localSettings.path_on_titlebar}
        onCheckedChange={(v) => handleChange("path_on_titlebar", v)}
      />
    </div>
  );
};

// ----------------------
// Zoom Scale Setting
// ----------------------
export const ZoomScaleSetting = () => {
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const savedZoom = localStorage.getItem("zoom_scale");
    const zoomValue = savedZoom ? parseInt(savedZoom, 10) : 100;
    setZoom(zoomValue);
    applyZoom(zoomValue);
  }, []);

  const handleZoomChange = (newZoom: number) => {
    // Clamp and snap to the step so the buttons and slider stay in range.
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    setZoom(clamped);
    localStorage.setItem("zoom_scale", clamped.toString());
    applyZoom(clamped); // applies instantly — no reload needed
  };

  // Filled portion of the track, for the gradient fill.
  const fillPercent = ((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark sm:flex-row sm:items-center sm:justify-between">
      <div>
        <label className="font-medium text-text-light dark:text-text-dark">
          App Zoom Level
        </label>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Adjust the interface scale for better readability.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => handleZoomChange(zoom - ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Decrease zoom"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-light text-text-light-sub transition-colors hover:bg-border-light disabled:opacity-40 disabled:hover:bg-secondary-light dark:bg-secondary-dark dark:text-text-dark-sub dark:hover:bg-border-dark dark:disabled:hover:bg-secondary-dark"
        >
          <Minus size={16} />
        </button>

        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          aria-label="App zoom level"
          className="zoom-slider w-40"
          style={{
            background: `linear-gradient(to right, var(--slider-accent) ${fillPercent}%, color-mix(in srgb, var(--slider-accent) 20%, transparent) ${fillPercent}%)`,
          }}
        />

        <button
          type="button"
          onClick={() => handleZoomChange(zoom + ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Increase zoom"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-light text-text-light-sub transition-colors hover:bg-border-light disabled:opacity-40 disabled:hover:bg-secondary-light dark:bg-secondary-dark dark:text-text-dark-sub dark:hover:bg-border-dark dark:disabled:hover:bg-secondary-dark"
        >
          <Plus size={16} />
        </button>

        <span className="w-12 shrink-0 rounded-full bg-dark1/10 px-2 py-1 text-center text-sm font-semibold tabular-nums text-dark1 dark:bg-light1/10 dark:text-light1">
          {zoom}%
        </span>
      </div>
    </div>
  );
};

// ----------------------
// Appearance Settings Wrapper
// ----------------------
const AppearanceSettings = () => {
  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Appearance
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Customize how the app looks and feels.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <PathOnTitlebar />
        <ZoomScaleSetting />
      </div>
    </div>
  );
};

export default AppearanceSettings;
