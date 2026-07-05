import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { subscribe } from "./sseClient.js";
import type { SseEvent } from "./sseClient.js";
import { EditorView } from "./EditorView.js";

const TOKEN: string = (window as unknown as { __MODEL_EDITOR__?: { token: string } }).__MODEL_EDITOR__?.token ?? "";
const ORIGIN = crypto.randomUUID();

interface Shown { workflow: string; content: string; layout: Record<string, WorkflowUiMeta>; layoutRev: number; contentRev: number }

export function App() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [externalContent, setExternalContent] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const deferredRef = useRef<Extract<SseEvent, { type: "layout" }> | null>(null);

  // Latest committed dirty flag of the editor session (which lives inside
  // EditorView). App needs it to decide, on a `content` push, between silently
  // remounting the editor on Claude's new content (clean viewer — the common
  // "watch it render live" case) and surfacing ExternalChangeBanner (the human
  // has unsaved local edits to protect). A ref, not state: the SSE handler
  // closes over it once and only ever reads the current value.
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);

  // Declared before the effect that captures it in a closure (`onUp`) — the
  // React Compiler's `react-hooks/immutability` check is source-order-based,
  // not JS-hoisting-aware, so a function used-before-declared-in-text form
  // (even though it would work fine at runtime) is rejected.
  function applyLayout(layout: Record<string, WorkflowUiMeta>): void {
    setShown((s) => (s ? { ...s, layout, layoutRev: s.layoutRev + 1 } : s));
  }

  useEffect(() => {
    const onDown = () => { draggingRef.current = true; };
    const onUp = () => {
      draggingRef.current = false;
      const d = deferredRef.current;
      if (d) { deferredRef.current = null; applyLayout(d.layout); }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("pointerup", onUp); };
  }, []);

  useEffect(() => subscribe(ORIGIN, (e) => {
    if (e.type === "show") { setExternalContent(null); setShown({ workflow: e.workflow, content: e.content, layout: e.layout, layoutRev: 0, contentRev: 0 }); }
    else if (e.type === "content") {
      setShown((s) => {
        if (!s || s.workflow !== e.workflow) return s;
        // Human has unsaved local edits → don't clobber them; warn via banner.
        if (dirtyRef.current) { setExternalContent(e.content); return s; }
        // Clean viewer → remount the editor on Claude's new content. contentRev
        // is part of EditorView's `key`, so a fresh session mounts with
        // dirty=false — meaning the *next* clean push auto-applies too, with no
        // applyExternalDocument baseline drift. Node positions come from the
        // already-seeded layout; only the reactflow camera re-fits.
        return { ...s, content: e.content, contentRev: s.contentRev + 1 };
      });
    }
    else if (e.type === "layout") {
      if (e.origin === ORIGIN) return;                       // echo suppression
      setShown((s) => {
        if (!s || s.workflow !== e.workflow) return s;
        if (draggingRef.current) { deferredRef.current = e; return s; } // mid-drag defer
        return { ...s, layout: e.layout, layoutRev: s.layoutRev + 1 };
      });
    }
  }), []);

  if (!shown) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>Waiting for Claude to <code>show_workflow</code>…</div>;
  }
  return (
    <EditorView
      key={`${shown.workflow}:${shown.contentRev}`}
      token={TOKEN}
      origin={ORIGIN}
      workflow={shown.workflow}
      content={shown.content}
      layout={shown.layout}
      layoutRev={shown.layoutRev}
      externalContent={externalContent}
      onDismissExternal={() => setExternalContent(null)}
      onDirtyChange={onDirtyChange}
    />
  );
}
