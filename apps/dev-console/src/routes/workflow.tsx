import { useEffect, useRef, useState } from "react";
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
import { serializeImportPayload } from "@cyoda/workflow-core";

const jsonEditorConfig: WorkflowJsonEditorConfig = { monaco: getMonacoRuntime() };

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
  const suppressNextChange = useRef(false);

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
          height: 36,
          flexShrink: 0,
          borderBottom: "1px solid #E0E0E0",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
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
          <span style={{ color: "#F58220", flexShrink: 0 }}>● Unsaved</span>
        )}

        <button
          onClick={handleSaveRequest}
          disabled={!session.dirty}
          title="Save (⌘S)"
          style={{ ...toolbarBtn, opacity: session.dirty ? 1 : 0.4 }}
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
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <WorkflowEditorHostPanel
          session={session}
          jsonEditorConfig={jsonEditorConfig}
          onSaveRequest={handleSaveRequest}
        />
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
