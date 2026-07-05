import { useState } from "react";
import { useTokens } from "@cyoda/console-design-system";
import type { IndexItem } from "./api.js";

export interface CurrentSelection {
  kind: "workflow" | "entity";
  name: string;
}

export interface SidebarProps {
  workflows: IndexItem[];
  entities: IndexItem[];
  current: CurrentSelection | null;
  onSelect: (kind: "workflow" | "entity", name: string) => void;
  onRefresh: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** Collapsible left picker: Workflows/Entities groups, filterable by name.
 *  Toggling collapsed hides the list entirely so the main pane goes full-width. */
export function Sidebar({ workflows, entities, current, onSelect, onRefresh, collapsed, onToggleCollapsed }: SidebarProps) {
  const t = useTokens();
  const [filter, setFilter] = useState("");

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapsed}
        aria-label="Show sidebar"
        style={{ width: 28, border: "none", background: t.color.surfaceAlt, cursor: "pointer" }}
      >
        »
      </button>
    );
  }

  const q = filter.trim().toLowerCase();
  const matches = (item: IndexItem) => q === "" || item.name.toLowerCase().includes(q);

  return (
    <div style={{ width: 240, display: "flex", flexDirection: "column", borderRight: `1px solid ${t.color.border}`, height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 8 }}>
        <input
          type="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, height: 26, padding: "0 6px", border: `1px solid ${t.color.border}`, borderRadius: 2 }}
        />
        <button onClick={onRefresh} aria-label="Refresh list" style={{ border: "none", background: "none", cursor: "pointer" }}>⟳</button>
        <button onClick={onToggleCollapsed} aria-label="Hide sidebar" style={{ border: "none", background: "none", cursor: "pointer" }}>«</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <Group title="Workflows" items={workflows.filter(matches)} kind="workflow" current={current} onSelect={onSelect} />
        <Group title="Entities" items={entities.filter(matches)} kind="entity" current={current} onSelect={onSelect} />
      </div>
    </div>
  );
}

function Group({ title, items, kind, current, onSelect }: {
  title: string; items: IndexItem[]; kind: "workflow" | "entity";
  current: CurrentSelection | null;
  onSelect: (kind: "workflow" | "entity", name: string) => void;
}) {
  const t = useTokens();
  return (
    <div>
      <div style={{ padding: "6px 8px", fontSize: 11, textTransform: "uppercase", color: t.color.textMuted }}>{title}</div>
      {items.map((item) => {
        const active = current?.kind === kind && current.name === item.name;
        return (
          <button
            key={item.name}
            onClick={() => onSelect(kind, item.name)}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "6px 8px",
              border: "none", background: active ? t.color.surfaceAlt : "transparent",
              cursor: "pointer", fontSize: 13, color: t.color.text,
            }}
          >
            {item.name}
          </button>
        );
      })}
      {items.length === 0 ? <div style={{ padding: "4px 8px", fontSize: 12, color: t.color.textMuted }}>None</div> : null}
    </div>
  );
}
