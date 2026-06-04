import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTokens } from "./ThemeProvider";

export function FilePath({ path, copyable = false }: { path: string; copyable?: boolean }) {
  const t = useTokens();
  const [copied, setCopied] = useState(false);

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
    <span style={{ display: "flex", alignItems: "center", gap: t.space.xs, minWidth: 0 }}>
      <code style={{
        fontFamily: t.font.mono,
        fontSize: t.font.sizes.sm,
        color: t.color.textMuted,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
        flex: 1,
      }}>
        {path}
      </code>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copy path"
          title={copied ? "Copied!" : "Copy path"}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: copied ? t.color.success : t.color.textFaint,
            padding: "1px 2px",
            borderRadius: t.radius.sm,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
    </span>
  );
}
