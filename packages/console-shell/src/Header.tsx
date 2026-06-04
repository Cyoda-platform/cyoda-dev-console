import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTokens();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${t.space.md}`,
        height: 48,
        flexShrink: 0,
        background: t.color.surface,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      <strong
        style={{
          fontFamily: t.font.sans,
          fontWeight: t.font.weights.bold,
          fontSize: t.font.sizes.lg,
          color: t.color.teal,
          letterSpacing: "-0.3px",
        }}
      >
        {title}
      </strong>
      <div>{right}</div>
    </header>
  );
}
