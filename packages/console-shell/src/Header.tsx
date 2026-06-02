import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTokens();
  return (
    <header
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `0 ${t.space.md}`, height: 40, flexShrink: 0,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      <strong>{title}</strong>
      <div>{right}</div>
    </header>
  );
}
