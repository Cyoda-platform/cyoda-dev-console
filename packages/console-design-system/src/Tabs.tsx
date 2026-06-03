import { useTokens } from "./ThemeProvider";

export interface TabItem {
  id: string;
  label: string;
}

/**
 * Controlled, Carbon-style tab strip. Domain-neutral: callers own the active id and the
 * rendered panel. Tabs expose the `tab`/`tablist` ARIA roles for accessibility.
 */
export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const t = useTokens();
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            style={{
              appearance: "none",
              background: "none",
              border: "none",
              padding: `${t.space.sm} ${t.space.md}`,
              cursor: "pointer",
              fontFamily: t.font.sans,
              fontSize: t.font.sizes.md,
              color: active ? t.color.text : t.color.textMuted,
              fontWeight: active ? 600 : 400,
              borderBottom: active
                ? `2px solid ${t.color.cyodaGreen}`
                : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
