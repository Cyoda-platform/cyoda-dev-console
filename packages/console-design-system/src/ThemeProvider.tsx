import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import { createContext, useContext, type ReactNode } from "react";
import { tokens, type DesignTokens } from "./tokens";

const ThemeContext = createContext<DesignTokens>(tokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={tokens}>
      <div style={{ fontFamily: tokens.font.sans, color: tokens.color.text, background: tokens.color.surface, height: "100%" }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTokens(): DesignTokens {
  return useContext(ThemeContext);
}
