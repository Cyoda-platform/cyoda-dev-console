import { useTokens, Button, Panel } from "@cyoda/console-design-system";

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function CompareView({
  diskContents,
  editorContents,
  filePath,
  onKeepMine,
  onReloadDisk,
  onCancel,
}: {
  diskContents: string;
  editorContents: string;
  filePath: string;
  onKeepMine: () => void;
  onReloadDisk: () => void;
  onCancel: () => void;
}) {
  const t = useTokens();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        padding: t.space.lg,
      }}
    >
      <Panel title={`Compare: ${basename(filePath)}`}>
        <div style={{ display: "flex", gap: t.space.sm, marginBottom: t.space.md }}>
          <Button variant="primary" onClick={onKeepMine}>Keep mine</Button>
          <Button variant="secondary" onClick={onReloadDisk}>Reload disk version</Button>
          <Button variant="secondary" onClick={onCancel} style={{ marginLeft: "auto" }}>
            Cancel
          </Button>
        </div>
        <div
          style={{
            display: "flex",
            gap: t.space.md,
            height: "calc(100vh - 200px)",
            overflow: "hidden",
          }}
        >
          {[
            { label: "Disk version", content: prettyJson(diskContents) },
            { label: "Your version (editor)", content: prettyJson(editorContents) },
          ].map(({ label, content }) => (
            <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div
                style={{
                  fontFamily: t.font.sans,
                  fontSize: t.font.sizes.sm,
                  fontWeight: 600,
                  marginBottom: t.space.xs,
                  color: t.color.textMuted,
                }}
              >
                {label}
              </div>
              <pre
                style={{
                  flex: 1,
                  margin: 0,
                  overflow: "auto",
                  fontFamily: t.font.mono,
                  fontSize: t.font.sizes.sm,
                  background: t.color.surfaceAlt,
                  padding: t.space.md,
                  borderRadius: t.radius.sm,
                  border: `1px solid ${t.color.border}`,
                }}
              >
                {content}
              </pre>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
