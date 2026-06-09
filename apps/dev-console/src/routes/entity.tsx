import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityViewer } from "../components/EntityViewer.js";
import { useTokens } from "@cyoda/console-design-system";
import { readTextFile, writeTextFileWithConfirmedOverwrite } from "../ipc/fsio.js";
import { ContextMenu } from "../components/ContextMenu.js";
import { MonacoJsonViewer } from "../components/MonacoJsonViewer.js";
import { revealInFinder, openInIde } from "../ipc/shell.js";

interface MenuState {
  x: number;
  y: number;
}

type ViewMode = "tree" | "json";

export function EntityRoute({
  filePath,
  relativePath,
  displayName,
}: {
  filePath: string;
  relativePath: string;
  displayName: string;
}) {
  const t = useTokens();
  const qc = useQueryClient();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorValueRef = useRef<string | null>(null);

  const handleSave = useCallback(async (value?: string) => {
    const content = value ?? editorValueRef.current;
    if (!content) return;
    setSaving(true);
    try {
      await writeTextFileWithConfirmedOverwrite(filePath, content);
      void qc.invalidateQueries({ queryKey: ["read", filePath] });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [filePath, qc]);

  const q = useQuery({
    queryKey: ["read", filePath],
    queryFn: () => readTextFile(filePath),
  });

  const toolbarBtn: React.CSSProperties = {
    background: "none",
    border: "1px solid #E2E8F0",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 500,
    color: "#64748B",
    padding: "4px 10px",
  };

  const menuItems = [
    { label: "Reveal in Finder", onClick: () => void revealInFinder(filePath) },
    { label: "Open in Zed", onClick: () => void openInIde(filePath, "zed") },
    { label: "Open in IntelliJ", onClick: () => void openInIde(filePath, "intellij") },
    { label: "Open in VS Code", onClick: () => void openInIde(filePath, "vscode") },
    {
      label: "Copy relative path",
      onClick: () => void navigator.clipboard.writeText(relativePath),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* File header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 42,
          flexShrink: 0,
          borderBottom: `1px solid ${t.color.border}`,
          fontFamily: t.font.mono,
          fontSize: t.font.sizes.sm,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <strong style={{ color: t.color.text }}>{displayName}</strong>
          <span style={{ marginLeft: 6, color: t.color.textMuted }} title={relativePath}>
            {relativePath}
          </span>
        </span>

        {viewMode === "json" && dirty && (
          <span style={{ color: "#D97706", flexShrink: 0 }}>● Unsaved</span>
        )}
        {viewMode === "json" && (
          <button
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            style={{ ...toolbarBtn, opacity: dirty && !saving ? 1 : 0.4 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}

        <button
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
          style={toolbarBtn}
          title="File actions"
        >
          ⋯
        </button>
      </div>

      {/* Surface tabs — same style as workflow editor */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderBottom: "1px solid #E2E8F0",
          background: "white",
          flexShrink: 0,
        }}
      >
        <SurfaceTab active={viewMode === "tree"} onClick={() => setViewMode("tree")}>
          Tree
        </SurfaceTab>
        <SurfaceTab active={viewMode === "json"} onClick={() => setViewMode("json")}>
          JSON
        </SurfaceTab>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", background: t.color.surface }}>
        {q.isLoading ? (
          <div style={{ padding: 16, fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.textMuted }}>Loading…</div>
        ) : q.isError ? (
          <div style={{ padding: 16, fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.danger }}>Read failed: {String(q.error)}</div>
        ) : viewMode === "json" ? (
          <MonacoJsonViewer
            contents={q.data!.contents}
            onSave={(v) => void handleSave(v)}
            onDirtyChange={(d, v) => {
              setDirty(d);
              editorValueRef.current = v ?? null;
            }}
          />
        ) : (
          <div style={{ padding: 16, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
            <EntityViewer contents={q.data!.contents} />
          </div>
        )}
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onDismiss={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}

function SurfaceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "#0F172A" : "#CBD5E1"}`,
        background: active ? "#0F172A" : "white",
        color: active ? "white" : "#0F172A",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
