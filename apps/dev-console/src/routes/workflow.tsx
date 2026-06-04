import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import {
  useEditorSession,
  WorkflowEditorHostPanel,
  OverwriteConfirmModal,
  ExternalChangeBanner,
} from "@cyoda/workflow-editor-host";
import type { WorkflowJsonEditorConfig } from "@cyoda/workflow-react";
import { readTextFile, writeTextFileWithConfirmedOverwrite, saveFileAs } from "../ipc/fsio.js";
import { onFileChanged } from "../ipc/watcher.js";
import { useProjectStore } from "../state/projectStore.js";
import { getMonacoRuntime } from "../monacoRuntime.js";
import { CompareView } from "../components/CompareView.js";
import { serializeImportPayload, parseImportPayload } from "@cyoda/workflow-core";
import { useAssistantChat } from "../assistant/useAssistantChat.js";
import { WorkflowAssistantPanel } from "../assistant/WorkflowAssistantPanel.js";

const AGENT_FLAG = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";

const jsonEditorConfig: WorkflowJsonEditorConfig = { monaco: getMonacoRuntime() };

const toolbarBtn: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 500,
  color: "#64748B",
  padding: "5px 12px",
};

const toolbarBtnPrimary: React.CSSProperties = {
  ...toolbarBtn,
  background: "#2563EB",
  border: "1px solid #2563EB",
  color: "#fff",
  fontWeight: 600,
};

export function WorkflowRoute({
  filePath,
  relativePath,
  displayName,
  initialContents,
  onDirtyChange,
}: {
  filePath: string;
  relativePath: string;
  displayName: string;
  initialContents: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const projectId = useProjectStore((s) => s.active!.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [diskSnapshot, setDiskSnapshot] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const suppressNextChange = useRef(false);
  const layoutFilePath = filePath.replace(/\.json$/, ".layout.json");
  const layoutKey = `${projectId}:${filePath}`;
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  // On mount: load layout file → seed localStorage → let editor pick it up
  useEffect(() => {
    readTextFile(layoutFilePath)
      .then(({ contents }) => { localStorage.setItem(layoutKey, contents); })
      .catch(() => { /* no layout file yet — that's fine */ })
      .finally(() => { setLayoutReady(true); });
  }, [layoutFilePath, layoutKey]);

  const handleWorkflowUiChange = useCallback((workflowUi: Record<string, WorkflowUiMeta>) => {
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(() => {
      if (Object.keys(workflowUi).length === 0) return;
      void writeTextFileWithConfirmedOverwrite(layoutFilePath, JSON.stringify(workflowUi, null, 2));
    }, 800);
  }, [layoutFilePath]);

  const session = useEditorSession({
    projectId,
    filePath,
    initialContents,
    io: {
      read: async (p) => {
        const r = await readTextFile(p);
        return { contents: r.contents, lastModified: r.lastModified };
      },
      write: async (p, contents) => {
        const r = await writeTextFileWithConfirmedOverwrite(p, contents);
        return { lastModified: r.lastModified, sizeBytes: r.sizeBytes };
      },
      saveAs: saveFileAs,
    },
  });

  // AI assistant scoped to this open file. Owned here (not in the panel) so the conversation
  // survives the drawer being toggled closed/open. Proposals are applied to the in-memory
  // editor session — not written to disk — so the existing dirty/Save flow stays in control.
  const assistant = useAssistantChat({
    getCurrentJson: () => (session.document ? serializeImportPayload(session.document) : undefined),
    relPath: relativePath,
    onApply: (canonical) => {
      // F-09: guard against silently discarding unsaved graph-editor edits.
      if (session.dirty) {
        throw new Error(
          "You have unsaved changes. Save or discard them before applying an AI suggestion."
        );
      }
      // F-06: throw so applyProposal() shows an error instead of a false-positive success banner.
      const result = parseImportPayload(canonical, session.document?.meta);
      if (!result.document) {
        throw new Error("Failed to apply: the proposed workflow JSON could not be parsed.");
      }
      session.applyExternalDocument(result.document);
    },
  });

  useEffect(() => {
    onDirtyChange?.(session.dirty);
  }, [session.dirty, onDirtyChange]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void onFileChanged((evt) => {
      if (evt.path !== filePath) return;
      if (suppressNextChange.current) {
        suppressNextChange.current = false;
        return;
      }
      setExternalChange(true);
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, [filePath]);

  const handleSaveRequest = () => {
    if (!session.dirty) return;
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmOpen(false);
    suppressNextChange.current = true;
    await session.save();
    setExternalChange(false);
  };

  const handleReload = async () => {
    await session.revert();
    setExternalChange(false);
  };

  const handleCompare = async () => {
    try {
      const r = await readTextFile(filePath);
      setDiskSnapshot(r.contents);
      setCompareOpen(true);
    } catch (e) {
      console.error("Failed to read file for comparison:", e);
    }
  };

  const handleReloadAfterCompare = async () => {
    setCompareOpen(false);
    await handleReload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {externalChange ? (
        <ExternalChangeBanner
          onReload={handleReload}
          onIgnore={() => setExternalChange(false)}
          onCompare={handleCompare}
          dirty={session.dirty}
        />
      ) : null}

      {/* Compact file header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 42,
          flexShrink: 0,
          background: "#fff",
          borderBottom: "1px solid #E2E8F0",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 12,
        }}
      >
        {/* Breadcrumb */}
        <span style={{ color: "#525252", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          <strong style={{ color: "#161616" }}>{displayName}</strong>
          <span style={{ marginLeft: 6, color: "#8D8D8D" }} title={relativePath}>
            {relativePath}
          </span>
        </span>

        {session.dirty && (
          <span style={{ color: "#D97706", flexShrink: 0 }}>● Unsaved</span>
        )}

        <button
          onClick={handleSaveRequest}
          disabled={!session.dirty}
          title="Save (⌘S)"
          style={session.dirty ? toolbarBtnPrimary : { ...toolbarBtn, opacity: 0.5, background: "#fff" }}
        >
          Save
        </button>

        {session.saveAs != null && (
          <button onClick={() => void session.saveAs?.()} style={toolbarBtn}>
            Save As…
          </button>
        )}

        <button onClick={() => void handleReload()} style={toolbarBtn} title="Reload from disk">
          Reload
        </button>

        {AGENT_FLAG && (
          <button
            onClick={() => setAiOpen((o) => !o)}
            title="AI Assistant"
            aria-pressed={aiOpen}
            style={{
              ...toolbarBtn,
              background: aiOpen ? "#0A7469" : "#0D9488",
              color: "#fff",
              border: "none",
              fontWeight: 600,
            }}
          >
            AI
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "row" }}>
        {/* Editor stays mounted regardless of the drawer, so the graph is never lost on toggle. */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {layoutReady && (
          <WorkflowEditorHostPanel
            session={session}
            jsonEditorConfig={jsonEditorConfig}
            onSaveRequest={handleSaveRequest}
            onWorkflowUiChange={handleWorkflowUiChange}
          />
          )}
        </div>

        {AGENT_FLAG && aiOpen && (
          <WorkflowAssistantPanel
            chat={assistant}
            displayName={displayName}
            relativePath={relativePath}
            parseOk={session.parseOk}
            dirty={session.dirty}
            onClose={() => setAiOpen(false)}
          />
        )}
      </div>

      {confirmOpen ? (
        <OverwriteConfirmModal
          path={filePath}
          onConfirm={() => void handleConfirmSave()}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}

      {compareOpen && diskSnapshot != null && (
        <CompareView
          diskContents={diskSnapshot}
          editorContents={session.document ? serializeImportPayload(session.document) : ""}
          filePath={filePath}
          onKeepMine={() => { setCompareOpen(false); setExternalChange(false); }}
          onReloadDisk={() => void handleReloadAfterCompare()}
          onCancel={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
