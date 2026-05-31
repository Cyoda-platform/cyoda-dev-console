import { useEffect, useRef, useState } from "react";
import {
  useEditorSession,
  WorkflowEditorHostPanel,
  OverwriteConfirmModal,
  ExternalChangeBanner,
} from "@cyoda/workflow-editor-host";
import type { WorkflowJsonEditorConfig } from "@cyoda/workflow-react";
import { readTextFile, writeTextFileWithConfirmedOverwrite } from "../ipc/fsio.js";
import { onFileChanged } from "../ipc/watcher.js";
import { useProjectStore } from "../state/projectStore.js";
import { getMonacoRuntime } from "../monacoRuntime.js";
import { CompareView } from "../components/CompareView.js";
import { serializeImportPayload } from "@cyoda/workflow-core";

const jsonEditorConfig: WorkflowJsonEditorConfig = { monaco: getMonacoRuntime() };

export function WorkflowRoute({
  filePath,
  initialContents,
  onClose,
  onDirtyChange,
}: {
  filePath: string;
  initialContents: string;
  onClose: () => void;
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

  // Only open the confirm modal when there are actual structural changes.
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
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 16px", height: 36, flexShrink: 0,
        borderBottom: "1px solid #E0E0E0",
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 12,
      }}>
        {session.dirty && (
          <span style={{ color: "#F58220" }}>• Unsaved changes</span>
        )}
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto", background: "none", border: "none",
            cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            color: "#525252", padding: "2px 8px",
          }}
        >
          ← Files
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
