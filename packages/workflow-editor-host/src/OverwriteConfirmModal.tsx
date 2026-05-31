import { Button, Panel, FilePath } from "@cyoda/console-design-system";

export function OverwriteConfirmModal({
  path,
  onConfirm,
  onCancel,
}: {
  path: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
      <Panel title="Overwrite workflow file?">
        <p>This will replace the contents of:</p>
        <FilePath path={path} />
        <p>
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
