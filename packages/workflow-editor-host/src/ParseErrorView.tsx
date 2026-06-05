import type { ValidationIssue } from "@cyoda/workflow-core";
import { WarningBanner, useTokens } from "@cyoda/console-design-system";

export function ParseErrorView({ issues, rawContent }: { issues: ValidationIssue[]; rawContent?: string }) {
  const t = useTokens();
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
            fontFamily: t.font.mono,
            fontSize: 12,
            color: t.color.textMuted,
            marginBottom: 8,
          }}>
            File contents:
          </div>
          <pre style={{
            margin: 0,
            padding: 12,
            background: t.color.surfaceMuted,
            borderRadius: 4,
            fontFamily: t.font.mono,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: t.color.text,
          }}>
            {rawContent}
          </pre>
        </div>
      )}
    </div>
  );
}
