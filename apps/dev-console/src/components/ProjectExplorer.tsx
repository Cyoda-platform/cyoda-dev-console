import { useState, useEffect, useRef } from "react";
import { RefreshCw, FolderOpen, Code2, ChevronDown, ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { WORKFLOW_STATUSES, type WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { useTokens } from "@cyoda/console-design-system";
import { deriveDisplayName } from "../utils/displayName.js";
import { revealInFinder, openInIde } from "../ipc/shell.js";
import { ContextMenu } from "./ContextMenu.js";


interface MenuState {
  x: number;
  y: number;
  path: string;
}

export function ProjectExplorer({
  allEntries,
  selectedPath,
  onOpen,
  collapsed,
  onToggleCollapse,
  onRescan,
  onOpenSettings: _onOpenSettings,
  onOpenAgent,
  projectRoot,
  workflowRoot,
  entityRoot,
  onNewWorkflow,
  onNewEntity,
  onDeleteFile,
}: {
  allEntries: WorkflowFileIndexEntry[];
  selectedPath: string | null;
  onOpen: (entry: WorkflowFileIndexEntry) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRescan: () => void;
  onOpenSettings: () => void;
  /** Optional — only provided when the BYO AI feature flag is on. */
  onOpenAgent?: () => void;
  projectRoot: string;
  workflowRoot?: string | null;
  entityRoot?: string | null;
  onNewWorkflow?: (name: string) => void;
  onNewEntity?: (name: string) => void;
  onDeleteFile?: (path: string, displayName: string) => void;
}) {
  const t = useTokens();
  const [search, setSearch] = useState("");
  const [workflowsExpanded, setWorkflowsExpanded] = useState(true);
  const [entitiesExpanded, setEntitiesExpanded] = useState(true);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [creating, setCreating] = useState<"workflow" | "entity" | null>(null);
  const [width, setWidth] = useState(280);
  const draggingRef = useRef(false);
  const dragStart = useRef({ x: 0, w: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - dragStart.current.x;
      setWidth(Math.max(160, Math.min(480, dragStart.current.w + delta)));
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const wfRoot = workflowRoot?.replace(/\/$/, "") || null;
  const enRoot = entityRoot?.replace(/\/$/, "") || null;

  const workflowEntries = allEntries.filter(
    (e) =>
      WORKFLOW_STATUSES.includes(e.status) &&
      (!wfRoot || e.relativePath.startsWith(wfRoot + "/")),
  );
  const entityEntries = allEntries.filter(
    (e) =>
      e.status === "json-not-workflow" &&
      (!enRoot || e.relativePath.startsWith(enRoot + "/")),
  );

  const q = search.trim().toLowerCase();
  const match = (e: WorkflowFileIndexEntry) =>
    !q ||
    deriveDisplayName(e).toLowerCase().includes(q) ||
    e.relativePath.toLowerCase().includes(q);

  const filteredWorkflows = workflowEntries.filter(match);
  const filteredEntities = entityEntries.filter(match);

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        aria-label="Expand explorer"
        style={{
          width: 20,
          background: t.color.surfaceAlt,
          border: "none",
          borderRight: `1px solid ${t.color.border}`,
          cursor: "pointer",
          color: t.color.textMuted,
          fontSize: 10,
          flexShrink: 0,
          padding: 0,
        }}
      >
        <ChevronRight size={12} />
      </button>
    );
  }

  return (
    <>
      <div
        aria-label="Project Explorer"
        style={{
          width,
          minWidth: width,
          maxWidth: width,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${t.color.border}`,
          background: t.color.surface,
          overflow: "hidden",
        }}
      >
        {/* Explorer header with hover actions — VS Code style */}
        <ExplorerHeader
          onRescan={onRescan}
          projectRoot={projectRoot}
        />

        {/* Top-level navigation (feature-flagged entries) */}
        {onOpenAgent && (
          <div style={{ padding: "10px 10px 0", flexShrink: 0 }}>
            <button
              onClick={onOpenAgent}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "7px 12px",
                background: t.color.teal,
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: t.font.sans,
                fontSize: t.font.sizes.md,
                fontWeight: 600,
                color: "#fff",
              }}
            >
              ✦ AI Assistant
            </button>
          </div>
        )}

        {/* Search */}
        <div
          style={{
            padding: "8px 10px",
            borderBottom: `1px solid ${t.color.border}`,
            flexShrink: 0,
          }}
        >
          <label
            htmlFor="explorer-search"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
            }}
          >
            Search files
          </label>
          <input
            id="explorer-search"
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              height: 30,
              padding: "0 10px",
              fontFamily: t.font.sans,
              fontSize: t.font.sizes.md,
              border: `1px solid ${t.color.border}`,
              borderRadius: 6,
              background: t.color.surface,
              color: t.color.text,
              outline: "none",
            }}
          />
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <ExplorerSection
            label="Workflows"
            count={filteredWorkflows.length}
            expanded={workflowsExpanded}
            onToggle={() => setWorkflowsExpanded((v) => !v)}
            {...(onNewWorkflow ? { onNew: () => { setCreating("workflow"); setWorkflowsExpanded(true); } } : {})}
          >
            {creating === "workflow" && (
              <NewFileInput
                onSubmit={(name) => { onNewWorkflow?.(name); setCreating(null); }}
                onCancel={() => setCreating(null)}
              />
            )}
            {filteredWorkflows.length === 0 && creating !== "workflow" ? (
              <EmptyRow text={q ? "No matches" : "No workflow files"} />
            ) : (
              filteredWorkflows.map((e) => (
                <ExplorerItem
                  key={e.path}
                  entry={e}
                  displayName={deriveDisplayName(e)}
                  selected={e.path === selectedPath}
                  onOpen={onOpen}
                  onContextMenu={(x, y) => setMenu({ x, y, path: e.path })}
                />
              ))
            )}
          </ExplorerSection>

          <ExplorerSection
            label="Entities"
            count={filteredEntities.length}
            expanded={entitiesExpanded}
            onToggle={() => setEntitiesExpanded((v) => !v)}
            {...(onNewEntity ? { onNew: () => { setCreating("entity"); setEntitiesExpanded(true); } } : {})}
          >
            {creating === "entity" && (
              <NewFileInput
                onSubmit={(name) => { onNewEntity?.(name); setCreating(null); }}
                onCancel={() => setCreating(null)}
              />
            )}
            {filteredEntities.length === 0 && creating !== "entity" ? (
              <EmptyRow text={q ? "No matches" : "No entity files"} />
            ) : (
              filteredEntities.map((e) => (
                <ExplorerItem
                  key={e.path}
                  entry={e}
                  displayName={deriveDisplayName(e)}
                  selected={e.path === selectedPath}
                  onOpen={onOpen}
                  onContextMenu={(x, y) => setMenu({ x, y, path: e.path })}
                  dotColor="#0D9488"
                />
              ))
            )}
          </ExplorerSection>

        </div>

        {/* Bottom bar: collapse */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderTop: `1px solid ${t.color.border}`,
            background: t.color.surface,
            flexShrink: 0,
            height: 28,
          }}
        >
          <button
            onClick={onToggleCollapse}
            aria-label="Collapse explorer"
            style={{
              flex: 1,
              height: 28,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: t.font.sans,
              fontSize: t.font.sizes.sm,
              color: t.color.textMuted,
            }}
          >
            <ChevronLeft size={12} /> Collapse
          </button>
        </div>
      </div>

      {/* Resize drag handle */}
      <div
        role="separator"
        aria-label="Resize explorer"
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          dragStart.current = { x: e.clientX, w: width };
        }}
        style={{
          width: 4,
          cursor: "col-resize",
          background: "transparent",
          flexShrink: 0,
        }}
      />

      {menu && (
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
            {
              label: "Copy relative path",
              onClick: () => {
                const entry = allEntries.find((e) => e.path === menu.path);
                if (entry) void navigator.clipboard.writeText(entry.relativePath);
              },
            },
            ...(onDeleteFile ? [{
              label: "Delete",
              onClick: () => {
                const entry = allEntries.find((e) => e.path === menu.path);
                if (entry) onDeleteFile(menu.path, deriveDisplayName(entry));
              },
            }] : []),
          ]}
        />
      )}
    </>
  );
}

function ExplorerSection({
  label,
  count,
  expanded,
  onToggle,
  onNew,
  children,
}: {
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  onNew?: () => void;
  children: React.ReactNode;
}) {
  const t = useTokens();
  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    background: t.color.surfaceAlt,
    borderBottom: `1px solid ${t.color.border}`,
  };
  const toggleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flex: 1,
    padding: "4px 8px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: t.font.sans,
    fontSize: 11,
    fontWeight: 600,
    color: t.color.textFaint,
    textAlign: "left",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    minWidth: 0,
  };
  return (
    <div>
      <div style={headerStyle}>
        <button onClick={onToggle} aria-expanded={expanded} style={toggleStyle}>
          <span aria-hidden style={{ display: "flex", alignItems: "center", width: 12, flexShrink: 0 }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          {label}
          {onNew && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onNew(); }}
              title={`New ${label.toLowerCase().replace(/ies$/, "y").replace(/s$/, "")}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                marginLeft: 4,
                borderRadius: 3,
                cursor: "pointer",
                color: t.color.textMuted,
                flexShrink: 0,
              }}
            >
              <Plus size={11} />
            </span>
          )}
          {count !== undefined && count > 0 && (
            <span style={{ marginLeft: "auto", fontWeight: 400, color: t.color.textMuted, fontSize: t.font.sizes.sm }}>
              {count}
            </span>
          )}
        </button>
      </div>
      {expanded && children}
    </div>
  );
}

function ExplorerItem({
  entry,
  displayName,
  selected,
  onOpen,
  onContextMenu,
  dotColor,
}: {
  entry: WorkflowFileIndexEntry;
  displayName: string;
  selected: boolean;
  onOpen: (entry: WorkflowFileIndexEntry) => void;
  onContextMenu: (x: number, y: number) => void;
  dotColor?: string;
}) {
  const t = useTokens();
  return (
    <div
      role="button"
      tabIndex={0}
      title={entry.relativePath}
      aria-pressed={selected}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(entry);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px 3px 20px",
        cursor: "pointer",
        background: selected ? t.color.blueSoft : "transparent",
        borderLeft: selected ? `2px solid ${t.color.blue}` : "2px solid transparent",
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
        color: selected ? t.color.blue : t.color.text,
        fontWeight: selected ? 500 : 400,
        userSelect: "none",
        outline: "none",
      }}
    >
      <StatusDot status={entry.status} {...(dotColor ? { colorOverride: dotColor } : {})} />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {displayName}
      </span>
    </div>
  );
}

function StatusDot({ status, colorOverride }: { status: WorkflowFileIndexEntry["status"]; colorOverride?: string }) {
  const t = useTokens();
  const { color, label } = colorOverride
    ? { color: colorOverride, label: "entity" }
    : status === "valid-workflow" || status === "export-payload"
      ? { color: t.color.success, label: "valid" }
      : status === "invalid-workflow" || status === "probable-workflow"
        ? { color: t.color.warning, label: "warnings" }
        : status === "parse-error"
          ? { color: t.color.danger, label: "error" }
          : { color: t.color.textMuted, label: "not a workflow" };

  return (
    <span
      aria-label={label}
      title={label}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function NewFileInput({ onSubmit, onCancel }: { onSubmit: (name: string) => void; onCancel: () => void }) {
  const t = useTokens();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const name = value.trim();
      if (name) onSubmit(name.endsWith(".json") ? name : `${name}.json`);
      else onCancel();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div style={{ padding: "3px 8px 3px 20px" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        placeholder="filename.json"
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 22,
          padding: "0 6px",
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.sm,
          border: `1px solid ${t.color.blue}`,
          borderRadius: 3,
          background: t.color.surface,
          color: t.color.text,
          outline: "none",
        }}
      />
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  const t = useTokens();
  return (
    <div
      style={{
        padding: "4px 8px 4px 20px",
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
        color: t.color.textMuted,
      }}
    >
      {text}
    </div>
  );
}

function ExplorerHeader({
  onRescan,
  projectRoot,
}: {
  onRescan: () => void;
  projectRoot: string;
}) {
  const t = useTokens();
  const iconBtn: React.CSSProperties = {
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    color: t.color.textMuted,
    fontSize: 13,
    padding: 0,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        height: 42,
        flexShrink: 0,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: t.color.textFaint,
        letterSpacing: "0.6px",
        textTransform: "uppercase",
        flex: 1,
        userSelect: "none",
      }}>
        Explorer
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button style={iconBtn} title="Rescan project" onClick={onRescan}>
            <RefreshCw size={13} />
          </button>
          <button style={iconBtn} title="Reveal in Finder" onClick={() => void revealInFinder(projectRoot)}>
            <FolderOpen size={13} />
          </button>
          <button style={iconBtn} title="Open in VS Code" onClick={() => void openInIde(projectRoot, "vscode")}>
            <Code2 size={13} />
          </button>
        </div>
    </div>
  );
}


