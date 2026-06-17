import { CYODA_GO_VERSIONS, type CyodaGoVersion } from "@cyoda/workflow-project-model";
import type { useTokens } from "@cyoda/console-design-system";

/** Human-readable label for each selectable cyoda-go version. */
const VERSION_LABELS: Record<CyodaGoVersion, string> = {
  "0.7": "v0.7.x",
  "0.8": "v0.8.0+",
};

/**
 * Shared cyoda-go version dropdown used by the first-run wizard and project settings.
 * Controls how workflow files are parsed and serialized for a project.
 */
export function CyodaGoVersionSelect({
  value,
  onChange,
  t,
  disabled,
}: {
  value: CyodaGoVersion;
  onChange: (v: CyodaGoVersion) => void;
  t: ReturnType<typeof useTokens>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CyodaGoVersion)}
      style={{
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
        padding: "5px 8px",
        borderRadius: t.radius.sm,
        border: `1px solid ${t.color.border}`,
        background: t.color.surface,
        color: t.color.text,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {CYODA_GO_VERSIONS.map((v) => (
        <option key={v} value={v}>
          {VERSION_LABELS[v]}
        </option>
      ))}
    </select>
  );
}
