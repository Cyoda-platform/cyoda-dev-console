import { WorkflowEditor, type WorkflowJsonEditorConfig } from "@cyoda/workflow-react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import type { EditorSession } from "./useEditorSession.js";
import { ParseErrorView } from "./ParseErrorView.js";

interface WorkflowEditorHostPanelProps {
  session: EditorSession;
  jsonEditorConfig?: WorkflowJsonEditorConfig | null;
  onSaveRequest?: () => void;
}

export function WorkflowEditorHostPanel({
  session,
  jsonEditorConfig,
  onSaveRequest,
}: WorkflowEditorHostPanelProps) {
  if (!session.parseOk || !session.document) {
    return <ParseErrorView issues={session.issues} rawContent={session.rawContent} />;
  }

  const handleChange = (doc: WorkflowEditorDocument) => session.setDocument(doc);
  const handleSave = onSaveRequest ?? (() => { void session.save(); });

  return (
    <WorkflowEditor
      // WorkflowEditor is uncontrolled — it reads `document` only on first render. Remount it
      // (fresh key) whenever the document is replaced externally (AI apply / revert) so the
      // graph reflects the new document. The key is NOT tied to ongoing edits, so typing in the
      // editor never remounts it. localStorageKey stays stable, so node layout is preserved.
      key={session.externalRevision}
      document={session.document}
      mode="editor"
      developerMode
      enableJsonEditor
      jsonEditor={jsonEditorConfig ?? null}
      jsonEditorPlacement="tab"
      localStorageKey={session.layoutKey}
      onChange={handleChange}
      onSave={handleSave}
    />
  );
}
