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
  /**
   * Whether to surface the editor's built-in, EDITABLE full-document JSON tab
   * (default true). The Monaco runtime in `jsonEditorConfig` also powers the
   * inspector's read/edit JSON fields (annotations, criteria), which are useful
   * independently of that tab — so a consumer can supply a runtime for those
   * while setting `enableJsonEditor={false}` to keep the editable tab off (the
   * read-only MCP shell does exactly this; its full-document JSON lives in a
   * separate read-only pane).
   */
  enableJsonEditor?: boolean;
  onSaveRequest?: () => void;
  onWorkflowUiChange?: (workflowUi: Record<string, WorkflowUiMeta>) => void;
}

export function WorkflowEditorHostPanel({
  session,
  jsonEditorConfig,
  enableJsonEditor = true,
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
      // The editable built-in JSON tab requires BOTH a Monaco runtime AND the
      // consumer opting in: enabling it without a runtime leaves a JSON button
      // that throws "Monaco runtime not configured" on click, and a consumer
      // may supply a runtime (for the inspector's Monaco fields) yet still want
      // the editable full-document tab off. `jsonEditor` (below) is passed
      // whenever a runtime exists, so the inspector's annotations/criteria
      // render in Monaco even when this tab is disabled.
      enableJsonEditor={enableJsonEditor && jsonEditorConfig != null}
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
