import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export type NavItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  active?: boolean;
};

export function Sidebar({ navItems }: { navItems: NavItem[] }) {
  const t = useTokens();
  return (
    <nav
      style={{
        background: t.color.surface,
        borderRight: `1px solid ${t.color.border}`,
        padding: t.space.sm,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {navItems.map((n) => (
        <button
          key={n.id}
          onClick={n.onSelect}
          style={{
            display: "flex",
            alignItems: "center",
            gap: t.space.sm,
            width: "100%",
            textAlign: "left",
            padding: `${t.space.sm} ${t.space.sm}`,
            borderRadius: t.radius.md,
            background: n.active ? t.color.blueSoft : "transparent",
            color: n.active ? t.color.blue : t.color.textMuted,
            fontWeight: n.active ? t.font.weights.medium : t.font.weights.normal,
            fontFamily: t.font.sans,
            fontSize: t.font.sizes.md,
            border: "none",
            cursor: "pointer",
          }}
        >
          {n.icon} {n.label}
        </button>
      ))}
    </nav>
  );
}
