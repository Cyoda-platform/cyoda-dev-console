import { useState, useRef } from "react";
import { useTokens } from "@cyoda/console-design-system";

const MAX_NAME = 200;
const CHIP_LIMIT = 5;

function chipSegments(rootPath: string): string[] {
  const unique: string[] = [];
  for (const seg of rootPath.split("/").filter(Boolean)) {
    if (!unique.includes(seg)) unique.push(seg);
  }
  return unique.slice(-CHIP_LIMIT);
}

export function ProjectNameField({
  name,
  rootPath,
  onCommit,
}: {
  name: string;
  rootPath: string;
  onCommit: (name: string) => void;
}) {
  const t = useTokens();
  const [value, setValue] = useState(name); // mount-once seed; not re-seeded on prop change
  const committedRef = useRef(name);

  const commit = (raw: string) => {
    const next = raw.trim();
    if (next === committedRef.current) {
      setValue(next); // already committed (or unchanged) — keep shown, don't re-fire
      return;
    }
    if (next.length >= 1 && next.length <= MAX_NAME && next !== name) {
      committedRef.current = next;
      onCommit(next);
      setValue(next);
    } else {
      setValue(name); // rejected/empty/unchanged → revert visible value
    }
  };

  const segments = chipSegments(rootPath);

  return (
    <div>
      <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, marginBottom: 2 }}>
        Project name
      </div>
      <input
        aria-label="Project name"
        value={value}
        maxLength={MAX_NAME}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(value);
          else if (e.key === "Escape") setValue(name);
        }}
        onBlur={() => commit(value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 26,
          padding: "0 8px",
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.md,
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.sm,
          background: t.color.surface,
          color: t.color.text,
          outline: "none",
        }}
      />
      {segments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: t.space.xs,
            marginTop: t.space.xs,
          }}
        >
          <span style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
            Use a folder name:
          </span>
          {segments.map((seg, i) => (
            <button
              key={`${seg}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(seg)}
              style={{
                fontFamily: t.font.sans,
                fontSize: t.font.sizes.sm,
                color: t.color.text,
                background: t.color.surfaceMuted,
                border: `1px solid ${t.color.border}`,
                borderRadius: t.radius.sm,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {seg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
