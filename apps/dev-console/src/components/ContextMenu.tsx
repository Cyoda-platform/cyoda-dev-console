import { useRef, useLayoutEffect, useState, type ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onDismiss,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onDismiss: () => void;
}) {
  const t = useTokens();
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      top:  y + height > vh ? Math.max(0, y - height) : y,
      left: x + width  > vw ? Math.max(0, x - width)  : x,
    });
  }, [x, y]);

  return (
    <>
      {/* Invisible overlay to catch clicks outside */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 999 }}
        onClick={onDismiss}
      />
      <ul
        ref={menuRef}
        role="menu"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          zIndex: 1000,
          margin: 0,
          padding: `${t.space.xs} 0`,
          listStyle: "none",
          background: t.color.surface,
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.md,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          minWidth: 180,
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.md,
        }}
      >
        {items.map((item) => (
          <ContextMenuRow
            key={item.label}
            label={item.label}
            onClick={() => {
              item.onClick();
              onDismiss();
            }}
          />
        ))}
      </ul>
    </>
  );
}

function ContextMenuRow({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): ReactNode {
  const t = useTokens();
  return (
    <li role="menuitem">
      <button
        onClick={onClick}
        style={{
          display: "block",
          width: "100%",
          padding: `${t.space.xs} ${t.space.md}`,
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: t.color.text,
          fontFamily: "inherit",
          fontSize: "inherit",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            t.color.surfaceAlt;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
      >
        {label}
      </button>
    </li>
  );
}
