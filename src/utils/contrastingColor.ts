export const getContrastingTextColor = (hex: string): string => {
  if (!hex) return "#1F2937"; // Default to dark text

  // Remove the '#' if present
  const cleanHex = hex.startsWith("#") ? hex.slice(1) : hex;

  // Convert hex to RGB
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);

  // Calculate the YIQ value to determine color brightness
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  // Return black for light colors, white for dark colors
  return yiq >= 128 ? "#1F2937" : "#FFFFFF";
};
