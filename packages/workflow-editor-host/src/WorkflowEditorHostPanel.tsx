import { useState } from "react";
import { WorkflowEditor, type WorkflowJsonEditorConfig } from "@cyoda/workflow-react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import type { EditorSession } from "./useEditorSession.js";
import { ParseErrorView } from "./ParseErrorView.js";
import { NullCriterionModal } from "./NullCriterionModal.js";
import { nullCriterionPaths } from "./nullCriterion.js";

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
  const [remediationDismissed, setRemediationDismissed] = useState(false);

  if (!session.parseOk || !session.document) {
    const nullPaths = nullCriterionPaths(session.rawContent, session.issues);
    return (
      <>
        <ParseErrorView issues={session.issues} rawContent={session.rawContent} />
        {nullPaths.length > 0 && !remediationDismissed && (
          <NullCriterionModal
            paths={nullPaths}
            onApply={() => session.remediateNullCriteria()}
            onDismiss={() => setRemediationDismissed(true)}
          />
        )}
      </>
    );
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
      // Only surface the editor's built-in JSON tab when a Monaco runtime is
      // actually configured. Enabling it without one leaves a JSON button that
      // throws "Monaco runtime not configured" on click (the read-only MCP
      // viewer passes no config and serves JSON via a separate pane instead).
      enableJsonEditor={jsonEditorConfig != null}
      jsonEditor={jsonEditorConfig ?? null}
      jsonEditorPlacement="tab"
      localStorageKey={session.layoutKey}
      onChange={handleChange}
      onSave={handleSave}
      showSaveButton={false}
      {...(onWorkflowUiChange ? { onWorkflowUiChange } : {})}
    />
  );
}
