import { Button, Panel, FilePath, useTokens } from "@cyoda/console-design-system";

export function OverwriteConfirmModal({
  path,
  onConfirm,
  onCancel,
}: {
  path: string;
  onConfirm: () => void;
  onCancel: () => void;
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
      <Panel title="Overwrite workflow file?" style={{ width: "100%", maxWidth: 560, boxSizing: "border-box" }}>
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.text, margin: `0 0 ${t.space.xs}` }}>
          This will replace the contents of:
        </p>
        <div style={{ margin: `0 0 ${t.space.md}` }}>
          <FilePath path={path} />
        </div>
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted, margin: `0 0 ${t.space.md}` }}>
          Only clean Cyoda workflow JSON will be written. Editor layout, comments, edge
          anchors, and viewport state will not be saved into the workflow file.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Overwrite
          </Button>
        </div>
      </Panel>
    </div>
  );
}
