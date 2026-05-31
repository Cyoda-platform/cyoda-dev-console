import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

const PANEL_WIDTH = 240;

export function SplitPane({
  left,
  right,
  collapsed,
  onToggleCollapse,
}: {
  left: ReactNode;
  right: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const t = useTokens();

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          width: collapsed ? 0 : PANEL_WIDTH,
          minWidth: collapsed ? 0 : PANEL_WIDTH,
          overflow: "hidden",
          borderRight: collapsed ? "none" : `1px solid ${t.color.border}`,
          display: "flex",
          flexDirection: "column",
          visibility: collapsed ? "hidden" : "visible",
        }}
      >
        {left}
      </div>

      <button
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand file tree" : "Collapse file tree"}
        style={{
          flexShrink: 0,
          width: 16,
          background: t.color.surfaceAlt,
          border: "none",
          borderRight: `1px solid ${t.color.border}`,
          cursor: "pointer",
          color: t.color.textMuted,
          fontSize: 10,
          padding: 0,
        }}
      >
        {collapsed ? "›" : "‹"}
      </button>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {right}
      </div>
    </div>
  );
}
