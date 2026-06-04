import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { createContext, useContext, type ReactNode } from "react";
import { tokens, type DesignTokens } from "./tokens";

const ThemeContext = createContext<DesignTokens>(tokens);

const scrollbarStyles = `
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.3); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.55); }
  ::-webkit-scrollbar-corner { background: transparent; }
`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={tokens}>
      <style>{scrollbarStyles}</style>
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
