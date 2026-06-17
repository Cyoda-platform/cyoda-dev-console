import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { SUPPORTED_CYODA_VERSIONS } from "@cyoda/workflow-core";
import { useTokens } from "@cyoda/console-design-system";
import { ContextMenu } from "./ContextMenu.js";
import { revealInFinder, openInIde } from "../ipc/shell.js";
import { useProjectStore } from "../state/projectStore.js";

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
  const active = useProjectStore((s) => s.active);

  return (
    <div ref={parentRef} style={{ height: "100%", overflow: "auto" }}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((vi) => {
          const e = entries[vi.index]!;
          const clickable = onOpen;
          const incompatibleTip =
            e.status === "incompatible-version"
              ? e.error ??
                `Not parseable under cyoda-go v${active?.cyodaGoVersion ?? ""}. The console supports v${SUPPORTED_CYODA_VERSIONS.join(" and v")}.`
              : undefined;
          return (
            <div
              key={vi.key}
              onClick={clickable ? () => onOpen(e) : undefined}
              onContextMenu={(evt) => {
                evt.preventDefault();
                setMenu({ x: evt.clientX, y: evt.clientY, path: e.path });
              }}
              title={incompatibleTip}
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
                  e.status === "valid-workflow" ||
                  e.status === "valid-workflow-legacy" ||
                  e.status === "export-payload" ||
                  e.status === "probable-workflow"
                    ? t.color.text
                    : t.color.textMuted,
              }}
            >
              <StatusDot status={e.status} />
              &nbsp;
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.relativePath}
              </span>
              {e.status === "valid-workflow-legacy" && e.cyodaVersion && (
                <VersionBadge label={`v${e.cyodaVersion}`} t={t} />
              )}
              {e.status === "incompatible-version" && (
                <VersionBadge
                  label={e.cyodaVersion ? `needs v${e.cyodaVersion}` : "incompatible"}
                  t={t}
                  tone="caution"
                />
              )}
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

function VersionBadge({
  label,
  t,
  tone = "muted",
}: {
  label: string;
  t: ReturnType<typeof useTokens>;
  tone?: "muted" | "caution";
}) {
  return (
    <span
      style={{
        marginLeft: 6,
        flexShrink: 0,
        fontFamily: t.font.sans,
        fontSize: "10px",
        fontWeight: 600,
        lineHeight: "14px",
        padding: "0 6px",
        borderRadius: 7,
        background: tone === "caution" ? t.color.warning : t.color.border,
        color: tone === "caution" ? "#3a2a00" : t.color.textMuted,
      }}
    >
      {label}
    </span>
  );
}

function StatusDot({
  status,
}: {
  status: WorkflowFileIndexEntry["status"];
}) {
  const t = useTokens();
  const color =
    status === "valid-workflow" || status === "valid-workflow-legacy" || status === "export-payload"
      ? t.color.success
      : status === "invalid-workflow" || status === "probable-workflow" || status === "incompatible-version"
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
