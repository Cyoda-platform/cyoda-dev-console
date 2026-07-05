import { useEffect, useRef, useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { subscribe } from "./sseClient.js";
import type { SseEvent } from "./sseClient.js";
import { EditorView } from "./EditorView.js";

const TOKEN: string = (window as unknown as { __MODEL_EDITOR__?: { token: string } }).__MODEL_EDITOR__?.token ?? "";
const ORIGIN = crypto.randomUUID();

interface Shown { workflow: string; content: string; layout: Record<string, WorkflowUiMeta>; layoutRev: number }

export function App() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [externalContent, setExternalContent] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const deferredRef = useRef<Extract<SseEvent, { type: "layout" }> | null>(null);

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
    if (e.type === "show") { setExternalContent(null); setShown({ workflow: e.workflow, content: e.content, layout: e.layout, layoutRev: 0 }); }
    else if (e.type === "content") { setShown((s) => (s && s.workflow === e.workflow ? (setExternalContent(e.content), s) : s)); }
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
      key={shown.workflow}
      token={TOKEN}
      origin={ORIGIN}
      workflow={shown.workflow}
      content={shown.content}
      layout={shown.layout}
      layoutRev={shown.layoutRev}
      externalContent={externalContent}
      onDismissExternal={() => setExternalContent(null)}
    />
  );
}
