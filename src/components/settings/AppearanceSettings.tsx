import { useState, useEffect } from "react";
import { Switch } from "../ui/Switch";
import { Dropdown } from "../ui/Dropdown";

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

  const handleChange = (name, value) => {
    setLocalSettings((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "path_on_titlebar") {
        localStorage.setItem(name, JSON.stringify(value));
      }
      return updated;
    });
    window.location.reload();
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

    if (webFrame) {
      webFrame.setZoomFactor(newZoom / 100);
    }
    window.location.reload();
  };

  return (
    <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
      <div>
        <label className="font-medium text-text-light dark:text-text-dark">
          App Zoom Level
        </label>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
          Adjust the interface scale for better readability.
        </p>
      </div>

      <Dropdown
        options={[
          { label: "80%", value: 80 },
          { label: "90%", value: 90 },
          { label: "100%", value: 100 },
          { label: "110%", value: 110 },
          { label: "120%", value: 120 },
          { label: "125%", value: 125 },
          { label: "150%", value: 150 },
        ]}
        onSelect={handleZoomChange}
        placeholder={`${zoom}%`}
        selectedValue={zoom}
      />
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
