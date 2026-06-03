import { useMemo, useState } from "react";
import { WarningBanner, useTokens } from "@cyoda/console-design-system";
import { JsonTree, JsonTreeProvider } from "./JsonTree.js";

export function EntityViewer({ contents }: { contents: string }) {
  const t = useTokens();
  const [search, setSearch] = useState("");

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(contents) as unknown };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [contents]);

  if (!parsed.ok)
    return <WarningBanner severity="caution">Invalid JSON: {parsed.error}</WarningBanner>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      {/* Search bar */}
      <div style={{ flexShrink: 0 }}>
        <input
          type="search"
          placeholder="Search keys and values…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: 28,
            padding: "0 8px",
            fontFamily: t.font.mono,
            fontSize: t.font.sizes.sm,
            border: `1px solid ${t.color.border}`,
            borderRadius: 2,
            background: t.color.surfaceAlt,
            color: t.color.text,
            outline: "none",
          }}
        />
      </div>

      {/* Tree */}
      <JsonTreeProvider query={search}>
        <JsonTree value={parsed.value as never} />
      </JsonTreeProvider>
    </div>
  );
}
