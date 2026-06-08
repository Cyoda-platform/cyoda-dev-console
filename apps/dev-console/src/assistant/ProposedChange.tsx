import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import { Button, useTokens } from "@cyoda/console-design-system";

/**
 * Side-by-side view of the current workflow file vs the assistant's proposed (already
 * validated + canonicalized) version, with Apply / Cancel. Mirrors the style of
 * components/CompareView.tsx.
 */
export function ProposedChange({
  current,
  proposed,
  applying,
  onApply,
  onCancel,
  applyLabel = "Apply to file",
}: {
  current: string;
  proposed: string;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
  applyLabel?: string;
}) {
  const t = useTokens();
  const [expanded, setExpanded] = useState<"current" | "proposed" | null>(null);

  const pre: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    margin: 0,
    padding: t.space.sm,
    overflow: "auto",
    maxHeight: 280,
    background: t.color.surfaceAlt,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.sm,
    fontFamily: t.font.mono,
    fontSize: t.font.sizes.sm,
    whiteSpace: "pre",
  };
  const heading: React.CSSProperties = {
    fontFamily: t.font.sans,
    fontSize: t.font.sizes.sm,
    fontWeight: 600,
    color: t.color.textMuted,
    marginBottom: t.space.xs,
  };
  return (
    <div
      style={{
        border: `1px solid ${t.color.teal}`,
        borderRadius: t.radius.md,
        padding: t.space.md,
        background: t.color.surface,
      }}
    >
      <div style={{ fontFamily: t.font.sans, fontWeight: 600, marginBottom: t.space.sm }}>
        Proposed workflow change
      </div>
      <div style={{ display: "flex", gap: t.space.md }}>
        {(["current", "proposed"] as const).map((side) => (
          <div key={side} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: t.space.xs }}>
              <span style={{ ...heading, marginBottom: 0, flex: 1 }}>
                {side === "current" ? "Current" : "Proposed"}
              </span>
              <button
                type="button"
                title={`Expand ${side === "current" ? "Current" : "Proposed"}`}
                onClick={() => setExpanded(side)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: t.color.textMuted,
                  padding: 2,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: t.radius.sm,
                }}
              >
                <Maximize2 size={12} />
              </button>
            </div>
            <pre style={side === "current" ? pre : { ...pre, borderColor: t.color.teal }}>
              {side === "current" ? current : proposed}
            </pre>
          </div>
        ))}
      </div>

      {expanded && (
        <div
          data-testid="expand-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 2000,
          }}
          onClick={() => setExpanded(null)}
        >
          <div
            style={{
              width: "80vw",
              height: "80vh",
              display: "flex",
              flexDirection: "column",
              background: t.color.surface,
              border: `1px solid ${expanded === "proposed" ? t.color.teal : t.color.border}`,
              borderRadius: t.radius.lg,
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: `${t.space.sm} ${t.space.md}`,
              borderBottom: `1px solid ${t.color.border}`,
              flexShrink: 0,
            }}>
              <span style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: t.font.sizes.md, flex: 1 }}>
                {expanded === "current" ? "Current" : "Proposed"}
              </span>
              <button
                type="button"
                title="Close"
                onClick={() => setExpanded(null)}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: t.color.textMuted, padding: 4, display: "flex", alignItems: "center" }}
              >
                <X size={16} />
              </button>
            </div>
            <pre style={{
              flex: 1,
              margin: 0,
              padding: t.space.md,
              overflow: "auto",
              fontFamily: t.font.mono,
              fontSize: t.font.sizes.sm,
              background: t.color.surfaceAlt,
              whiteSpace: "pre",
              color: t.color.text,
            }}>
              {expanded === "current" ? current : proposed}
            </pre>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: t.space.sm, marginTop: t.space.md }}>
        <Button onClick={onApply} disabled={applying}>
          {applying ? "Applying…" : applyLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={applying}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
