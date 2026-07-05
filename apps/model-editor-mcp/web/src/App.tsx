import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { subscribe } from "./sseClient.js";
import type { SseEvent } from "./sseClient.js";
import { fetchIndex, fetchWorkflow, fetchEntity } from "./api.js";
import type { IndexItem } from "./api.js";
import { Sidebar } from "./Sidebar.js";
import { WorkflowPane } from "./WorkflowPane.js";
import { EntityPane } from "./EntityPane.js";

const TOKEN: string = (window as unknown as { __MODEL_EDITOR__?: { token: string } }).__MODEL_EDITOR__?.token ?? "";
const ORIGIN = crypto.randomUUID();

interface WorkflowView { kind: "workflow"; workflow: string; content: string; layout: Record<string, WorkflowUiMeta>; layoutRev: number; contentRev: number }
interface EntityView { kind: "entity"; name: string; contents: string }
type View = WorkflowView | EntityView;

export function App() {
  const [view, setView] = useState<View | null>(null);
  const [externalContent, setExternalContent] = useState<string | null>(null);
  const [index, setIndex] = useState<{ workflows: IndexItem[]; entities: IndexItem[] }>({ workflows: [], entities: [] });
  const [collapsed, setCollapsed] = useState(false);

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

  const refreshIndex = useCallback(() => { void fetchIndex().then(setIndex); }, []);
  useEffect(() => { refreshIndex(); }, [refreshIndex]);

  // Declared before the effect that captures it in a closure (`onUp`) — the
  // React Compiler's `react-hooks/immutability` check is source-order-based,
  // not JS-hoisting-aware, so a function used-before-declared-in-text form
  // (even though it would work fine at runtime) is rejected.
  function applyLayout(layout: Record<string, WorkflowUiMeta>): void {
    setView((v) => (v && v.kind === "workflow" ? { ...v, layout, layoutRev: v.layoutRev + 1 } : v));
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
    if (e.type === "show") {
      // Claude's push always wins over whatever the human is currently browsing.
      setExternalContent(null);
      setView({ kind: "workflow", workflow: e.workflow, content: e.content, layout: e.layout, layoutRev: 0, contentRev: 0 });
    } else if (e.type === "content") {
      setView((v) => {
        if (!v || v.kind !== "workflow" || v.workflow !== e.workflow) return v; // not the current view — ignored
        // Human has unsaved local edits → don't clobber them; warn via banner.
        if (dirtyRef.current) { setExternalContent(e.content); return v; }
        // Clean viewer → remount the editor on Claude's new content. contentRev
        // is part of WorkflowPane's EditorView `key`, so a fresh session mounts
        // with dirty=false — meaning the *next* clean push auto-applies too,
        // with no applyExternalDocument baseline drift.
        return { ...v, content: e.content, contentRev: v.contentRev + 1 };
      });
    } else if (e.type === "layout") {
      if (e.origin === ORIGIN) return; // echo suppression
      setView((v) => {
        if (!v || v.kind !== "workflow" || v.workflow !== e.workflow) return v; // not the current view — ignored
        if (draggingRef.current) { deferredRef.current = e; return v; } // mid-drag defer
        return { ...v, layout: e.layout, layoutRev: v.layoutRev + 1 };
      });
    } else if (e.type === "showEntity") {
      // Claude's `show_entity` — symmetric with `show`: it always wins over whatever the human is
      // currently browsing, switching the view to that entity's Tree/JSON pane. Same client-side
      // effect as the sidebar picker's entity `onSelect`, just Claude-driven.
      setExternalContent(null);
      setView({ kind: "entity", name: e.entity, contents: e.contents });
    }
  }), []);

  const onSelect = useCallback((kind: "workflow" | "entity", name: string) => {
    if (kind === "workflow") {
      void fetchWorkflow(name).then((p) => {
        setExternalContent(null);
        setView({ kind: "workflow", workflow: p.name, content: p.content, layout: p.layout as Record<string, WorkflowUiMeta>, layoutRev: 0, contentRev: 0 });
      });
    } else {
      void fetchEntity(name).then((p) => {
        setExternalContent(null);
        setView({ kind: "entity", name: p.name, contents: p.contents });
      });
    }
  }, []);

  const current = view ? { kind: view.kind, name: view.kind === "workflow" ? view.workflow : view.name } : null;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sidebar
        workflows={index.workflows}
        entities={index.entities}
        current={current}
        onSelect={onSelect}
        onRefresh={refreshIndex}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      />
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {!view ? (
          <div style={{ padding: 24, fontFamily: "system-ui" }}>
            Waiting for Claude to <code>show_workflow</code>, or pick a workflow/entity from the sidebar…
          </div>
        ) : view.kind === "workflow" ? (
          <WorkflowPane
            token={TOKEN}
            origin={ORIGIN}
            workflow={view.workflow}
            content={view.content}
            layout={view.layout}
            layoutRev={view.layoutRev}
            contentRev={view.contentRev}
            externalContent={externalContent}
            onDismissExternal={() => setExternalContent(null)}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <EntityPane contents={view.contents} />
        )}
      </div>
    </div>
  );
}
