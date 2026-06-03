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
        border: `1px solid ${t.color.cyodaGreen}`,
        borderRadius: t.radius.md,
        padding: t.space.md,
        background: t.color.surface,
      }}
    >
      <div style={{ fontFamily: t.font.sans, fontWeight: 600, marginBottom: t.space.sm }}>
        Proposed workflow change
      </div>
      <div style={{ display: "flex", gap: t.space.md }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={heading}>Current</div>
          <pre style={pre}>{current}</pre>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={heading}>Proposed</div>
          <pre style={{ ...pre, borderColor: t.color.cyodaGreen }}>{proposed}</pre>
        </div>
      </div>
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
