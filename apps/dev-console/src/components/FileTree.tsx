import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { useTokens } from "@cyoda/console-design-system";
import { ContextMenu } from "./ContextMenu.js";
import { revealInFinder, openInIde } from "../ipc/shell.js";

interface MenuState {
  x: number;
  y: number;
  path: string;
}

export function FileTree({
  entries,
  onOpen,
}: {
  entries: WorkflowFileIndexEntry[];
  onOpen?: (entry: WorkflowFileIndexEntry) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const v = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
  });
  const t = useTokens();

  return (
    <div ref={parentRef} style={{ height: "100%", overflow: "auto" }}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((vi) => {
          const e = entries[vi.index]!;
          const clickable = onOpen;
          return (
            <div
              key={vi.key}
              onClick={clickable ? () => onOpen(e) : undefined}
              onContextMenu={(evt) => {
                evt.preventDefault();
                setMenu({ x: evt.clientX, y: evt.clientY, path: e.path });
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translateY(${vi.start}px)`,
                width: "100%",
                height: vi.size,
                display: "flex",
                alignItems: "center",
                fontFamily: t.font.mono,
                fontSize: t.font.sizes.sm,
                padding: `0 ${t.space.md}`,
                cursor: clickable ? "pointer" : "default",
                color:
                  e.status === "valid-workflow"
                    ? t.color.text
                    : t.color.textMuted,
              }}
            >
              <StatusDot status={e.status} />
              &nbsp;
              {e.relativePath}
            </div>
          );
        })}
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onDismiss={() => setMenu(null)}
          items={[
            {
              label: "Reveal in Finder",
              onClick: () => void revealInFinder(menu.path),
            },
            {
              label: "Open in Zed",
              onClick: () => void openInIde(menu.path, "zed"),
            },
            {
              label: "Open in IntelliJ",
              onClick: () => void openInIde(menu.path, "intellij"),
            },
            {
              label: "Open in VS Code",
              onClick: () => void openInIde(menu.path, "vscode"),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

function StatusDot({
  status,
}: {
  status: WorkflowFileIndexEntry["status"];
}) {
  const t = useTokens();
  const color =
    status === "valid-workflow"
      ? t.color.success
      : status === "invalid-workflow"
        ? t.color.warning
        : status === "parse-error"
          ? t.color.danger
          : t.color.textMuted;
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
