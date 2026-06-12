import { useState, useCallback, createContext, useContext, memo } from "react";
import { useTokens } from "@cyoda/console-design-system";

// ── Context ──────────────────────────────────────────────────────────────────

interface TreeCtx {
  query: string;
  onCopy: (text: string) => void;
  copiedText: string | null;
}

const TreeContext = createContext<TreeCtx>({ query: "", onCopy: () => {}, copiedText: null });

// ── Types & colours ───────────────────────────────────────────────────────────

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

const CODE = {
  key:     "#0F62FE",
  string:  "#198038",
  number:  "#F58220",
  boolean: "#8A3FFC",
  null:    "#6F6F6F",
  bracket: "#525252",
  mark:    "#F1C21B",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function Highlight({ text }: { text: string }) {
  const { query } = useContext(TreeContext);
  if (!query) return <>{text}</>;
  const lo = text.toLowerCase();
  const q  = query.toLowerCase();
  const i  = lo.indexOf(q);
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: CODE.mark, borderRadius: 2, padding: "0 1px" }}>
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

function CopyBtn({ value }: { value: string }) {
  const { onCopy, copiedText } = useContext(TreeContext);
  const copied = copiedText === value;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onCopy(value); }}
      title="Copy value"
      style={{
        marginLeft: 6,
        padding: "0 4px",
        fontSize: 10,
        lineHeight: "14px",
        background: copied ? CODE.string : "transparent",
        color: copied ? "#fff" : CODE.bracket,
        border: `1px solid ${copied ? CODE.string : "#C6C6C6"}`,
        borderRadius: 2,
        cursor: "pointer",
        opacity: 0,
        transition: "opacity 0.1s",
      }}
      className="copy-btn"
    >
      {copied ? "✓" : "copy"}
    </button>
  );
}

// ── Row wrapper with hover highlight ─────────────────────────────────────────

function Row({
  children,
  path,
  copyValue,
}: {
  children: React.ReactNode;
  path: string;
  copyValue?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const t = useTokens();
  return (
    <div
      title={path}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "baseline",
        minHeight: 20,
        borderRadius: 2,
        padding: "0 2px",
        background: hovered ? t.color.surfaceAlt : "transparent",
        transition: "background 0.08s",
        cursor: "default",
      }}
      className={hovered ? "row-hovered" : ""}
    >
      <span style={{ flex: 1 }}>{children}</span>
      {hovered && copyValue !== undefined && <CopyBtn value={copyValue} />}
    </div>
  );
}

// ── JsonTree ──────────────────────────────────────────────────────────────────

export const JsonTree = memo(function JsonTree({
  value,
  label,
  path = "",
  depth = 0,
}: {
  value: JsonValue;
  label?: string;
  path?: string;
  depth?: number;
}) {
  const t = useTokens();
  const currentPath = label !== undefined
    ? (path ? `${path}.${label}` : String(label))
    : path;

  const base: React.CSSProperties = {
    fontFamily: t.font.mono,
    fontSize: "13px",
    lineHeight: "20px",
  };

  const labelEl = label !== undefined ? (
    <span>
      <span style={{ color: CODE.key }}><Highlight text={String(label)} /></span>
      <span style={{ color: t.color.textMuted }}>: </span>
    </span>
  ) : null;

  if (value === null)
    return (
      <div style={base}>
        <Row path={currentPath} copyValue="null">
          {labelEl}
          <span style={{ color: CODE.null, fontStyle: "italic" }}>null</span>
        </Row>
      </div>
    );

  if (typeof value === "boolean")
    return (
      <div style={base}>
        <Row path={currentPath} copyValue={String(value)}>
          {labelEl}
          <span style={{ color: CODE.boolean }}>{String(value)}</span>
        </Row>
      </div>
    );

  if (typeof value === "number")
    return (
      <div style={base}>
        <Row path={currentPath} copyValue={String(value)}>
          {labelEl}
          <span style={{ color: CODE.number }}>{value}</span>
        </Row>
      </div>
    );

  if (typeof value === "string")
    return (
      <div style={base}>
        <Row path={currentPath} copyValue={value}>
          {labelEl}
          <span style={{ color: CODE.string }}>
            &quot;<Highlight text={value} />&quot;
          </span>
        </Row>
      </div>
    );

  return <Collapsible value={value} label={label} path={currentPath} depth={depth} />;
});

function Collapsible({
  value,
  label,
  path,
  depth,
}: {
  value: object;
  label?: string | undefined;
  path: string;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const t = useTokens();
  const [hovered, setHovered] = useState(false);

  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : (Object.entries(value) as [string, JsonValue][]);
  const isArr = Array.isArray(value);
  const bracket = isArr ? { open: "[", close: "]" } : { open: "{", close: "}" };

  const base: React.CSSProperties = {
    fontFamily: t.font.mono,
    fontSize: "13px",
    lineHeight: "20px",
  };

  return (
    <div style={base}>
      <div
        title={path}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 2,
          borderRadius: 2,
          padding: "0 2px",
          background: hovered ? t.color.surfaceAlt : "transparent",
          transition: "background 0.08s",
          cursor: "default",
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: t.color.textMuted,
            fontSize: 13,
            padding: "0 4px 0 0",
            lineHeight: 1,
            flexShrink: 0,
            userSelect: "none",
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.12s",
          }}
        >
          ›
        </button>

        {label !== undefined && (
          <span>
            <span style={{ color: CODE.key }}><Highlight text={String(label)} /></span>
            <span style={{ color: t.color.textMuted }}>: </span>
          </span>
        )}

        <span style={{ color: CODE.bracket }}>{bracket.open}</span>

        {!open && (
          <>
            <span style={{ color: t.color.textMuted, fontSize: 11 }}>
              {entries.length} {isArr ? (entries.length === 1 ? "item" : "items") : (entries.length === 1 ? "key" : "keys")}
            </span>
            <span style={{ color: CODE.bracket }}>{bracket.close}</span>
          </>
        )}
      </div>

      {open && (
        <>
          <div style={{
            marginLeft: 12,
            paddingLeft: 8,
            borderLeft: `1px solid ${t.color.border}`,
          }}>
            {entries.map(([k, v]) => (
              <JsonTree
                key={String(k)}
                value={v as JsonValue}
                label={String(k)}
                path={path}
                depth={depth + 1}
              />
            ))}
          </div>
          <span style={{ color: CODE.bracket, paddingLeft: 4 }}>{bracket.close}</span>
        </>
      )}
    </div>
  );
}

// ── Provider (used by EntityViewer) ──────────────────────────────────────────

export function JsonTreeProvider({
  children,
  query,
}: {
  children: React.ReactNode;
  query: string;
}) {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const onCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1500);
  }, []);

  return (
    <TreeContext.Provider value={{ query, onCopy, copiedText }}>
      {children}
    </TreeContext.Provider>
  );
}
