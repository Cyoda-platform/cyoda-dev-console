import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export type NavItem = { id: string; label: string; icon?: ReactNode; onSelect: () => void; active?: boolean };

export function Sidebar({ navItems }: { navItems: NavItem[] }) {
  const t = useTokens();
  return (
    <nav style={{ borderRight: `1px solid ${t.color.border}`, padding: t.space.sm }}>
      {navItems.map((n) => (
        <button
          key={n.id}
          onClick={n.onSelect}
          style={{
            display: "block", width: "100%", textAlign: "left", padding: t.space.sm,
            background: n.active ? t.color.surfaceAlt : "transparent", border: "none",
            cursor: "pointer", fontFamily: t.font.sans,
          }}
        >
          {n.icon} {n.label}
        </button>
      ))}
    </nav>
  );
}
