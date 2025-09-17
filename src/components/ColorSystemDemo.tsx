import React from "react";
import { useColorThemeContext } from "../context/ColorThemeContext";

const ColorSystemDemo: React.FC = () => {
  const { colorSettings } = useColorThemeContext();

  const demoColors = [
    { label: "Base", var: "var(--color-base-light)" },
    { label: "Secondary", var: "var(--color-secondary-light)" },
    { label: "Tertiary", var: "var(--color-tertiary-light)" },
    { label: "Surface", var: "var(--color-surface-light)" },
    { label: "Base (Dark)", var: "var(--color-base-dark)" },
    { label: "Secondary (Dark)", var: "var(--color-secondary-dark)" },
    { label: "Tertiary (Dark)", var: "var(--color-tertiary-dark)" },
    { label: "Surface (Dark)", var: "var(--color-surface-dark)" },
  ];

  return (
    <div className="p-6 bg-secondary-light dark:bg-secondary-dark rounded-xl border border-border-light dark:border-border-dark">
      <h3 className="text-lg font-semibold text-text-light dark:text-text-dark mb-4">
        Color System Demo
      </h3>
      <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-4">
        This component demonstrates how the generated UI palette is applied
        throughout the app.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {demoColors.map((color) => (
          <div key={color.label} className="text-center">
            <div
              className="w-full h-16 rounded-lg mb-2 border border-border-light dark:border-border-dark"
              style={{ backgroundColor: color.var }}
            />
            <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
              {color.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-tertiary-light dark:bg-tertiary-dark rounded-lg">
        <p className="text-sm text-text-light dark:text-text-dark">
          <strong>Current Theme:</strong> {colorSettings.selectedTheme}
        </p>
        <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-1">
          Change colors in Settings to see this demo and the entire app UI
          update instantly.
        </p>
      </div>
    </div>
  );
};

export default ColorSystemDemo;
