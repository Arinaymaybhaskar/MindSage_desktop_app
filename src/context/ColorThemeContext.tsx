import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useColorTheme } from '../hooks/useColorTheme';

interface ColorThemeContextType {
  colorSettings: any;
  isLoaded: boolean;
  saveColorSettings: (settings: any) => void;
  updateColor: (colorKey: string, value: string) => void;
  resetToDefault: () => void;
  applyTheme: (themeName: string, themeColors: any) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

interface ColorThemeProviderProps {
  children: ReactNode;
}

export const ColorThemeProvider: React.FC<ColorThemeProviderProps> = ({ children }) => {
  const colorTheme = useColorTheme();

  return (
    <ColorThemeContext.Provider value={colorTheme}>
      {children}
    </ColorThemeContext.Provider>
  );
};

export const useColorThemeContext = () => {
  const context = useContext(ColorThemeContext);
  if (context === undefined) {
    throw new Error('useColorThemeContext must be used within a ColorThemeProvider');
  }
  return context;
};
