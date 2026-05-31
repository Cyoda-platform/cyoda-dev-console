export const tokens = {
  color: {
    cyodaGreen: "#004235",
    cyodaOrange: "#F58220",
    surface: "#FFFFFF",
    surfaceAlt: "#F4F4F4",
    border: "#E0E0E0",
    text: "#161616",
    textMuted: "#525252",
    danger: "#DA1E28",
    warning: "#F1C21B",
    success: "#198038",
  },
  radius: { sm: "2px", md: "4px", lg: "8px" },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
  font: {
    sans: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    sizes: { sm: "12px", md: "14px", lg: "16px", xl: "20px" },
  },
} as const;

export type DesignTokens = typeof tokens;
