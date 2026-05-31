import { useState, memo } from "react";
import { useTokens } from "@cyoda/console-design-system";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

export const JsonTree = memo(function JsonTree({
  value,
  label,
}: {
  value: JsonValue;
  label?: string;
}) {
  const t = useTokens();
  const labelEl =
    label !== undefined ? (
      <span style={{ color: t.color.textMuted }}>{label}: </span>
    ) : null;
  if (value === null)
    return (
      <div style={{ fontFamily: t.font.mono }}>
        {labelEl}
        <em>null</em>
      </div>
    );
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return (
      <div style={{ fontFamily: t.font.mono }}>
        {labelEl}
        <span>{JSON.stringify(value)}</span>
      </div>
    );
  }
  return <Collapsible value={value} label={label} />;
});

function Collapsible({
  value,
  label,
}: {
  value: object;
  label?: string | undefined;
}) {
  const [open, setOpen] = useState(true);
  const t = useTokens();
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : (Object.entries(value) as [string, JsonValue][]);
  return (
    <div style={{ fontFamily: t.font.mono }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: t.color.textMuted,
        }}
      >
        {open ? "▾" : "▸"}
      </button>
      {label !== undefined ? (
        <span style={{ color: t.color.textMuted }}>{label} </span>
      ) : null}
      <span>
        {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
      </span>
      {open ? (
        <div style={{ marginLeft: 16 }}>
          {entries.map(([k, v]) => (
            <JsonTree key={String(k)} value={v as JsonValue} label={String(k)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
