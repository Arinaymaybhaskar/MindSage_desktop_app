import React, { createContext, type ReactNode } from "react";
import { useColorTheme } from "../hooks/useColorTheme";

// Derived from the hook rather than restated, so adding a member to
// useColorTheme cannot silently drop it from the context.
export type ColorThemeContextType = ReturnType<typeof useColorTheme>;

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(
  undefined,
);

interface ColorThemeProviderProps {
  children: ReactNode;
}

export const ColorThemeProvider: React.FC<ColorThemeProviderProps> = ({
  children,
}) => {
  const colorTheme = useColorTheme();

  return (
    <ColorThemeContext.Provider value={colorTheme}>
      {children}
    </ColorThemeContext.Provider>
  );
};

export default ColorThemeContext;
