import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { createContext, useContext, type ReactNode } from "react";
import { tokens, type DesignTokens } from "./tokens";

const ThemeContext = createContext<DesignTokens>(tokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={tokens}>
      <div
        style={{
          fontFamily: tokens.font.sans,
          color: tokens.color.text,
          background: tokens.color.surfaceAlt,
          height: "100%",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTokens(): DesignTokens {
  return useContext(ThemeContext);
}
