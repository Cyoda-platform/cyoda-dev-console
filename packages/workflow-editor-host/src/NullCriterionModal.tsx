import { Button, Panel, useTokens } from "@cyoda/console-design-system";

/**
 * Shown when a workflow fails to parse solely because it carries
 * `criterion: null` entries. Explains the cause and offers the one-click
 * remediation (drop the null criteria — semantically identical to omitting
 * them, per `cyoda help workflows`: "null means always matches").
 */
export function NullCriterionModal({
  paths,
  onApply,
  onDismiss,
}: {
  paths: string[];
  onApply: () => void;
  onDismiss: () => void;
}) {
  const t = useTokens();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
    >
      <Panel title="This workflow can't be parsed" style={{ width: "100%", maxWidth: 620, boxSizing: "border-box" }}>
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.text, margin: `0 0 ${t.space.xs}` }}>
          <strong>Cause:</strong> {paths.length} {paths.length === 1 ? "entry uses" : "entries use"}{" "}
          <code style={{ fontFamily: t.font.mono }}>criterion: null</code>. Cyoda accepts that to mean
          “no condition”, but the editor cannot parse an explicit null — it expects the field to be omitted.
        </p>
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted, margin: `0 0 ${t.space.xs}` }}>
          <strong>Remediation:</strong> drop the null criteria. This is equivalent to “always matches” and does
          not change workflow behaviour.
        </p>
        <ul
          style={{
            margin: `0 0 ${t.space.md}`,
            paddingLeft: 20,
            maxHeight: 160,
            overflow: "auto",
            fontFamily: t.font.mono,
            fontSize: t.font.sizes.sm,
            color: t.color.textMuted,
          }}
        >
          {paths.map((p) => (
            <li key={p}>
              <code style={{ fontFamily: t.font.mono }}>{p}</code>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button variant="primary" onClick={onApply}>
            Drop null criteria
          </Button>
        </div>
      </Panel>
    </div>
  );
}
