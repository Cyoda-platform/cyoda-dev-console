import type { ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

type Severity = "warning" | "caution";
export function WarningBanner({ severity = "warning", children }: { severity?: Severity; children: ReactNode }) {
  const t = useTokens();
  const bg = severity === "caution" ? t.color.cyodaOrange : t.color.warning;
  const fg = severity === "caution" ? "#FFFFFF" : t.color.text;
  return (
    <div
      role="alert"
      style={{
        background: bg, color: fg, padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.sm, fontFamily: t.font.sans, fontSize: t.font.sizes.md,
      }}
    >
      {children}
    </div>
  );
}
