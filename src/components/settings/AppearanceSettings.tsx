import { useState, useEffect } from "react";
import { Switch } from "../ui/Switch";

const { webFrame } = window.require
  ? window.require("electron")
  : { webFrame: null };

export const PathOnTitlebar = () => {
  const [localSettings, setLocalSettings] = useState({
    path_on_titlebar: false,
  });

  const settings = JSON.parse(localStorage.getItem("settings")) || {};

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
    if (webFrame) {
      webFrame.setZoomFactor(zoomValue / 100);
    }
  }, []);

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    localStorage.setItem("zoom_scale", newZoom.toString());
    // Applies instantly — no reload needed.
    if (webFrame) {
      webFrame.setZoomFactor(newZoom / 100);
    }
  };

  return (
    <div className="flex justify-between items-center gap-4 p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
      <div>
        <label className="font-medium text-text-light dark:text-text-dark">
          App Zoom Level
        </label>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Adjust the interface scale for better readability.
        </p>
      </div>

      <div className="flex items-center gap-3 min-w-[220px] justify-end">
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          aria-label="App zoom level"
          className="w-40 cursor-pointer accent-dark1 dark:accent-light1"
        />
        <span className="w-12 text-right text-sm font-semibold tabular-nums text-text-light dark:text-text-dark">
          {zoom}%
        </span>
      </div>
    </div>
  );
};

// ----------------------
// Appearance Settings Wrapper
// ----------------------
const AppearanceSettings = ({ settings }) => {
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
