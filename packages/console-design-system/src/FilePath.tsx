import { useState } from "react";
import { useTokens } from "./ThemeProvider";

export function FilePath({ path, copyable = false }: { path: string; copyable?: boolean }) {
  const t = useTokens();
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: t.space.xs }}>
      <code style={{ fontFamily: t.font.mono, fontSize: t.font.sizes.sm, color: t.color.textMuted }}>{path}</code>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copy path"
          title="Copy path"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            border: "none",
            background: hovered ? t.color.surfaceAlt : "transparent",
            cursor: "pointer",
            fontFamily: t.font.sans,
            fontSize: t.font.sizes.sm,
            color: t.color.cyodaGreen,
            padding: "1px 6px",
            borderRadius: t.radius.sm,
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </span>
  );
}
