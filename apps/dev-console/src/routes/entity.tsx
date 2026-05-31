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

export function EntityRoute({
  filePath,
  onClose,
}: {
  filePath: string;
  onClose?: () => void;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const q = useQuery({
    queryKey: ["read", filePath],
    queryFn: () => readTextFile(filePath),
  });

  const menuItems = [
    {
      label: "Reveal in Finder",
      onClick: () => void revealInFinder(filePath),
    },
    { label: "Open in Zed", onClick: () => void openInIde(filePath, "zed") },
    {
      label: "Open in IntelliJ",
      onClick: () => void openInIde(filePath, "intellij"),
    },
    {
      label: "Open in VS Code",
      onClick: () => void openInIde(filePath, "vscode"),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          height: 36,
          flexShrink: 0,
          borderBottom: "1px solid #E0E0E0",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 12,
        }}
      >
        <button
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
          style={{
            background: "none",
            border: "1px solid #E0E0E0",
            borderRadius: 2,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            color: "#525252",
            padding: "2px 8px",
          }}
        >
          ⋯
        </button>
        {onClose ? (
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              color: "#525252",
              padding: "2px 8px",
            }}
          >
            ← Files
          </button>
        ) : null}
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
