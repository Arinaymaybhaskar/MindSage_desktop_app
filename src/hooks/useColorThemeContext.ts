import { useContext } from "react";
import ColorThemeContext, {
  type ColorThemeContextType,
} from "../context/ColorThemeContext";

/**
 * Lives here rather than beside the provider so `ColorThemeContext.tsx`
 * exports only components, which is what React Fast Refresh needs to hot-swap
 * it. Mirrors the `useAuth` / `AuthContext` split.
 */
export const useColorThemeContext = (): ColorThemeContextType => {
  const context = useContext(ColorThemeContext);
  if (context === undefined) {
    throw new Error(
      "useColorThemeContext must be used within a ColorThemeProvider"
    );
  }
  return context;
};
