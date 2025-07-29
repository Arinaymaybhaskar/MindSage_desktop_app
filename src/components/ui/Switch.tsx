import { useState } from "react";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = ({ checked, onCheckedChange }: SwitchProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <button
      onClick={() => onCheckedChange(!checked)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-indigo-600" : "bg-gray-300"
      } ${isFocused ? "ring-2 ring-indigo-400" : ""}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
};
