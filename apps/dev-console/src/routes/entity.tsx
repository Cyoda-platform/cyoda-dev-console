import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EntityViewer } from "@cyoda/entity-model-viewer";
import { readTextFile } from "../ipc/fsio.js";
import { ContextMenu } from "../components/ContextMenu.js";
import { revealInFinder, openInIde } from "../ipc/shell.js";

interface MenuState {
  x: number;
  y: number;
}

const toolbarBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid #E0E0E0",
  borderRadius: 2,
  cursor: "pointer",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 12,
  color: "#525252",
  padding: "2px 8px",
};

export function EntityRoute({
  filePath,
  relativePath,
  displayName,
}: {
  filePath: string;
  relativePath: string;
  displayName: string;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const q = useQuery({
    queryKey: ["read", filePath],
    queryFn: () => readTextFile(filePath),
  });

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
      {/* Compact file header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 36,
          flexShrink: 0,
          borderBottom: "1px solid #E0E0E0",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 12,
        }}
      >
        {/* Breadcrumb */}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <strong style={{ color: "#161616" }}>{displayName}</strong>
          <span style={{ marginLeft: 6, color: "#8D8D8D" }} title={relativePath}>
            {relativePath}
          </span>
        </span>

        <button
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
          style={toolbarBtn}
          title="File actions"
        >
          ⋯
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {q.isLoading ? (
          <div>Loading…</div>
        ) : q.isError ? (
          <div>Read failed: {String(q.error)}</div>
        ) : (
          <EntityViewer contents={q.data!.contents} />
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
