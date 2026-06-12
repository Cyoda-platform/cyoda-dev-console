export const tokens = {
  color: {
    // Brand
    teal: "#0D9488",
    tealSoft: "#CCFBF1",
    // Primary actions
    blue: "#2563EB",
    blueHover: "#1D4ED8",
    blueSoft: "#EFF6FF",
    // Surfaces
    surface: "#FFFFFF",
    surfaceAlt: "#F8FAFC",
    surfaceMuted: "#F1F5F9",
    // Borders
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    // Text
    text: "#0F172A",
    textSecondary: "#334155",
    textMuted: "#64748B",
    textFaint: "#94A3B8",
    // Semantic
    danger: "#DC2626",
    warning: "#D97706",
    success: "#059669",
    // Brand
    cyodaGreen: "#004235",
    cyodaOrange: "#F58220",
  },
  radius: { sm: "4px", md: "6px", lg: "8px" },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
  font: {
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    sizes: { sm: "12px", md: "13px", lg: "15px", xl: "20px" },
    weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  },
} as const;

export type DesignTokens = typeof tokens;
