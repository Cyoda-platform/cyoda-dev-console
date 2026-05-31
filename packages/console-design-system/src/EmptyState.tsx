import type { ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const t = useTokens();
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", gap: t.space.sm, padding: t.space.xl, height: "100%",
      }}
    >
      <div style={{ fontSize: t.font.sizes.xl, fontWeight: 600 }}>{title}</div>
      {description != null && (
        <div style={{ fontSize: t.font.sizes.md, color: t.color.textMuted, maxWidth: "420px" }}>{description}</div>
      )}
      {action != null && <div style={{ marginTop: t.space.sm }}>{action}</div>}
    </div>
  );
}
