import type { ValidationIssue } from "@cyoda/workflow-core";
import { WarningBanner } from "@cyoda/console-design-system";

export function ParseErrorView({ issues, rawContent }: { issues: ValidationIssue[]; rawContent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <WarningBanner severity="caution">
        <strong>Workflow JSON could not be parsed.</strong>
        <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
          {issues.map((i, idx) => (
            <li key={idx}>{i.message}</li>
          ))}
        </ul>
      </WarningBanner>
      {rawContent != null && (
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 12,
            color: "#525252",
            marginBottom: 8,
          }}>
            File contents:
          </div>
          <pre style={{
            margin: 0,
            padding: 12,
            background: "#F4F4F4",
            borderRadius: 2,
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "#161616",
          }}>
            {rawContent}
          </pre>
        </div>
      )}
    </div>
  );
}
