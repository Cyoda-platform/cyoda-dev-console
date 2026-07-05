import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { useEditorSession, WorkflowEditorHostPanel, ExternalChangeBanner } from "@cyoda/workflow-editor-host";

export function EditorView({
  token, origin, workflow, content, layout, layoutRev, externalContent, onDismissExternal,
}: {
  token: string; origin: string; workflow: string; content: string;
  layout: Record<string, WorkflowUiMeta>; layoutRev: number;
  externalContent: string | null; onDismissExternal: () => void;
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

  // Claude changed the shown file underneath the human. Two paths converge on
  // the same document swap: this effect (silent live re-render — no local
  // edits to protect) and the ExternalChangeBanner's "Reload" button (explicit
  // consent because local edits ARE present). `applyExternal` is the shared
  // primitive; only the "run automatically vs wait for a click" gate differs.
  const applyExternal = () => {
    if (externalContent != null) {
      const r = parseImportPayload(externalContent, session.document?.meta);
      if (r.document) session.applyExternalDocument(r.document);
    }
    onDismissExternal();
  };

  useEffect(() => {
    if (externalContent != null && !session.dirty) applyExternal();
    // Narrowed deps are intentional: this should fire exactly once per new
    // push while clean (or when a push already in flight stops being
    // protected because dirty flips false) — not on every session/document
    // identity churn `applyExternal` closes over. `applyExternal` and
    // `onDismissExternal` already read the latest render's values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalContent, session.dirty]);

  // Shown only when local edits exist to protect — see the effect above for
  // the auto-apply (clean) path, which resolves before the human ever sees a
  // banner (derived directly from the prop; no mirrored local state).
  const banner = externalContent != null && session.dirty;
  const onReload = () => applyExternal();

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
