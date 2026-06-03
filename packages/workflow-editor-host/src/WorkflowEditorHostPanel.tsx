import { WorkflowEditor, type WorkflowJsonEditorConfig } from "@cyoda/workflow-react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import type { EditorSession } from "./useEditorSession.js";
import { ParseErrorView } from "./ParseErrorView.js";

import type { WorkflowUiMeta } from "@cyoda/workflow-core";

interface WorkflowEditorHostPanelProps {
  session: EditorSession;
  jsonEditorConfig?: WorkflowJsonEditorConfig | null;
  onSaveRequest?: () => void;
  onWorkflowUiChange?: (workflowUi: Record<string, WorkflowUiMeta>) => void;
}

export function WorkflowEditorHostPanel({
  session,
  jsonEditorConfig,
  onSaveRequest,
  onWorkflowUiChange,
}: WorkflowEditorHostPanelProps) {
  if (!session.parseOk || !session.document) {
    return <ParseErrorView issues={session.issues} rawContent={session.rawContent} />;
  }

  const handleChange = (doc: WorkflowEditorDocument) => session.setDocument(doc);
  const handleSave = onSaveRequest ?? (() => { void session.save(); });

  return (
    <WorkflowEditor
      document={session.document}
      mode="editor"
      developerMode
      enableJsonEditor
      jsonEditor={jsonEditorConfig ?? null}
      jsonEditorPlacement="tab"
      localStorageKey={session.layoutKey}
      onChange={handleChange}
      onSave={handleSave}
      {...(onWorkflowUiChange ? { onWorkflowUiChange } : {})}
    />
  );
}
