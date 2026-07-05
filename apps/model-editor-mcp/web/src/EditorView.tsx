import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { useEditorSession, WorkflowEditorHostPanel, ExternalChangeBanner } from "@cyoda/workflow-editor-host";

export function EditorView({
  token, origin, workflow, content, layout, layoutRev, externalContent, onDismissExternal, onDirtyChange,
}: {
  token: string; origin: string; workflow: string; content: string;
  layout: Record<string, WorkflowUiMeta>; layoutRev: number;
  externalContent: string | null; onDismissExternal: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = externalContent ?? content; }, [content, externalContent]);

  // Browser is a viewer of disk: read serves the latest pushed content; write is
  // NOT wired in v1 — it warns (content is single-writer = Claude).
  const io = useMemo(() => ({
    read: async () => ({ contents: contentRef.current, lastModified: new Date().toISOString() }),
    write: async () => { throw new Error("Content is read-only here — changes go through Claude."); },
  }), []);

  const session = useEditorSession({ projectId: "model-editor", filePath: `${workflow}.json`, initialContents: content, io });

  // Report the session's dirty flag up to App, which uses it to decide — on a
  // content push — between silently remounting this component on Claude's new
  // content (clean) and routing the push here as a banner (unsaved local edits
  // present). Effect, not render, keeps react-hooks-7 happy; mirrors
  // dev-console's WorkflowRoute onDirtyChange effect.
  useEffect(() => { onDirtyChange(session.dirty); }, [session.dirty, onDirtyChange]);

  // Seed the (already server-remapped) layout into the editor's localStorage key,
  // re-seeding + remounting the canvas when a live layout push bumps layoutRev.
  // Seeded directly during render (React's "adjusting state when a prop
  // changes" pattern — https://react.dev/learn/you-might-not-need-an-effect)
  // rather than in a useEffect: `localStorage.setItem` is synchronous and
  // idempotent, so gating readiness via an effect-that-calls-setState would
  // only add an avoidable extra render pass after commit.
  const seedKey = `${session.layoutKey}::${layoutRev}`;
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (seedKey !== seededKey) {
    localStorage.setItem(session.layoutKey, JSON.stringify(layout));
    setSeededKey(seedKey);
  }
  const layoutReady = seededKey === seedKey;

  // Claude changed the shown file underneath a human who has unsaved local
  // edits → ExternalChangeBanner (reload / keep). Clean viewers never reach
  // here: App remounts this component on the new content instead of routing it
  // through `externalContent`, so a bannered push always means there's local
  // work to protect. Derived directly from the prop rather than mirrored into
  // local state: the banner's dismissal (`onDismissExternal`) clears
  // `externalContent` in the parent, which is what makes it disappear.
  const banner = externalContent != null;
  const onReload = () => {
    if (externalContent != null) {
      const r = parseImportPayload(externalContent, session.document?.meta);
      if (r.document) session.applyExternalDocument(r.document);
    }
    onDismissExternal();
  };

  // Layout write-back: debounce → POST /layout with the session token + tab origin.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWorkflowUiChange = useCallback((workflowUi: Record<string, WorkflowUiMeta>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (Object.keys(workflowUi).length === 0) return;
      void fetch("/layout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-session-token": token, "x-origin": origin },
        body: JSON.stringify({ name: workflow, workflowUi }),
      });
    }, 600);
  }, [token, origin, workflow]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {banner ? (
        <ExternalChangeBanner onReload={onReload} onIgnore={onDismissExternal} dirty={session.dirty} />
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }} key={`${workflow}:${layoutRev}`}>
        {layoutReady ? (
          <WorkflowEditorHostPanel
            session={session}
            onWorkflowUiChange={onWorkflowUiChange}
            onSaveRequest={() => window.alert("Content changes go through Claude — layout drags persist, content edits do not.")}
          />
        ) : null}
      </div>
    </div>
  );
}
