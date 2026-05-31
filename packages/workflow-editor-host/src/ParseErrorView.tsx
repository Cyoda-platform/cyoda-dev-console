import type { ValidationIssue } from "@cyoda/workflow-core";
import { WarningBanner } from "@cyoda/console-design-system";

export function ParseErrorView({ issues }: { issues: ValidationIssue[] }) {
  return (
    <WarningBanner severity="caution">
      <strong>Workflow JSON could not be parsed.</strong>
      <ul>
        {issues.map((i, idx) => (
          <li key={idx}>{i.message}</li>
        ))}
      </ul>
    </WarningBanner>
  );
}
