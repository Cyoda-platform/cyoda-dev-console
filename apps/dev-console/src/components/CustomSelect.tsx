import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useTokens } from "@cyoda/console-design-system";

export function CustomSelect({
  value,
  onChange,
  options,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  style?: React.CSSProperties;
}) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          width: "100%",
          height: 34,
          padding: "0 10px",
          background: t.color.surface,
          border: `1px solid ${open ? t.color.blue : t.color.border}`,
          borderRadius: t.radius.md,
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.md,
          color: t.color.text,
          cursor: "pointer",
          outline: "none",
          boxSizing: "border-box",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? value}
        </span>
        <ChevronDown
          size={14}
          color={t.color.textMuted}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: "100%",
            background: t.color.surface,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.md,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 12px",
                background: o.value === value ? t.color.blueSoft : "transparent",
                color: o.value === value ? t.color.blue : t.color.text,
                fontFamily: t.font.sans,
                fontSize: t.font.sizes.md,
                fontWeight: o.value === value ? 500 : 400,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
