import { useState, useEffect, useRef, useCallback } from "react";
import { Minus, Plus, Loader2 } from "lucide-react";
import { Switch } from "../ui/Switch";
import { appPrefsService } from "../../api/setupService";

const ZOOM_MIN = 80;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
const ZOOM_SAVE_DELAY = 800; // debounce before persisting/applying zoom

// Apply the zoom through the preload bridge. `window.require` is unavailable
// under contextIsolation, so the old webFrame lookup silently no-op'd, which
// is why zoom used to only take effect after a reload (App.tsx re-applies it
// from localStorage on startup via this same bridge).
const applyZoom = (percent: number) => {
  window.electron?.zoom?.set(percent / 100);
};

export const PathOnTitlebar = () => {
  const [localSettings, setLocalSettings] = useState({
    path_on_titlebar: false,
  });

  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem("settings") || "{}");
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
      // event only fires in *other* windows, so we dispatch our own instead, with no reload.
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingZoomRef = useRef<number | null>(null);

  useEffect(() => {
    const savedZoom = localStorage.getItem("zoom_scale");
    const zoomValue = savedZoom ? parseInt(savedZoom, 10) : 100;
    setZoom(zoomValue);
    applyZoom(zoomValue);
  }, []);

  const clampZoom = useCallback(
    (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)),
    [],
  );

  const saveZoom = useCallback(
    (value: number) => {
      const clamped = clampZoom(value);
      setZoom(clamped);
      setIsSaving(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        localStorage.setItem("zoom_scale", clamped.toString());
        applyZoom(clamped);
        setIsSaving(false);
      }, ZOOM_SAVE_DELAY);
    },
    [clampZoom],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerUp = () => {
      setIsDragging(false);
      if (pendingZoomRef.current !== null) {
        const zoomToSave = pendingZoomRef.current;
        pendingZoomRef.current = null;
        saveZoom(zoomToSave);
      }
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [isDragging, saveZoom]);

  // Clear any pending save if the component unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleZoomChange = (newZoom: number) => {
    const clamped = clampZoom(newZoom);
    setZoom(clamped);
    if (isDragging) {
      pendingZoomRef.current = clamped;
      return;
    }
    pendingZoomRef.current = null;
    saveZoom(clamped);
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
          onPointerDown={() => setIsDragging(true)}
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

        <div className="flex w-[70px] shrink-0 items-center justify-end gap-1.5">
          {isSaving && (
            <Loader2
              size={14}
              className="animate-spin text-dark1 dark:text-light1"
              aria-label="Saving"
            />
          )}
          <span className="rounded-full bg-dark1/10 px-2 py-1 text-sm font-semibold tabular-nums text-dark1 dark:bg-light1/10 dark:text-light1">
            {zoom}%
          </span>
        </div>
      </div>
    </div>
  );
};

// ----------------------
// Launch at Startup Setting
// ----------------------
export const LaunchAtStartupSetting = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    appPrefsService.get().then((prefs) => {
      if (prefs) setEnabled(prefs.launchAtStartup);
    });
  }, []);

  const handleChange = async (value: boolean) => {
    setEnabled(value); // optimistic
    const res = await appPrefsService.setLaunchAtStartup(value);
    setEnabled(res.launchAtStartup);
  };

  return (
    <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
      <div>
        <label className="font-medium text-text-light dark:text-text-dark">
          Launch at Startup
        </label>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Open MindSage automatically when you sign in to your computer.
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={handleChange} />
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
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark">
          Appearance
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Customize how the app looks and feels.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <PathOnTitlebar />
        <ZoomScaleSetting />
        <LaunchAtStartupSetting />
      </div>
    </div>
  );
};

export default AppearanceSettings;
