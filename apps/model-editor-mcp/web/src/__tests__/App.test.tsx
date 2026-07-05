/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import type { SseEvent } from "../sseClient.js";

// `App` mounts `EditorView`, which pulls in `@cyoda/workflow-editor-host` (real
// `WorkflowEditorHostPanel` -> real `@cyoda/workflow-react` `WorkflowEditor` ->
// reactflow, which cannot render under happy-dom — see EditorView.test.tsx for
// that real render, mocked one layer lower). Here we only need to prove App's
// own SSE-driven state machine (show/content/layout handling, drag-defer,
// echo-suppression, token wiring) — so EditorView is stubbed to a prop-capturing
// component and never actually renders a graph.
let capturedProps: Record<string, unknown> | null = null;
vi.mock("../EditorView.js", () => ({
  EditorView: (props: Record<string, unknown>) => {
    capturedProps = props;
    return null;
  },
}));

// Capture the (origin, onEvent) pair App hands to `subscribe` so tests can
// drive SSE events directly, and observe unsubscribe calls.
let onEventCb: ((e: SseEvent) => void) | null = null;
let subscribedOrigin: string | null = null;
const unsubscribe = vi.fn();
vi.mock("../sseClient.js", () => ({
  subscribe: (origin: string, onEvent: (e: SseEvent) => void) => {
    subscribedOrigin = origin;
    onEventCb = onEvent;
    return unsubscribe;
  },
}));

const layoutA: Record<string, WorkflowUiMeta> = { Pledge: { layout: { nodes: { none: { x: 0, y: 0 } } } } };
const layoutB: Record<string, WorkflowUiMeta> = { Pledge: { layout: { nodes: { none: { x: 9, y: 9 } } } } };

async function importApp() {
  const mod = await import("../App.js");
  return mod.App;
}

beforeEach(() => {
  capturedProps = null;
  onEventCb = null;
  subscribedOrigin = null;
  unsubscribe.mockClear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { __MODEL_EDITOR__?: unknown }).__MODEL_EDITOR__;
});

describe("App — token extraction", () => {
  it("reads the session token from window.__MODEL_EDITOR__ (populated server-side)", async () => {
    (window as unknown as { __MODEL_EDITOR__?: { token: string } }).__MODEL_EDITOR__ = { token: "abc123hex" };
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: {} }); });
    expect(capturedProps?.token).toBe("abc123hex");
  });

  it("falls back to an empty string when no token is embedded", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: {} }); });
    expect(capturedProps?.token).toBe("");
  });
});

describe("App — SSE-driven state", () => {
  it("shows a waiting placeholder until the first `show` event arrives", async () => {
    const App = await importApp();
    const { container } = render(<App />);
    expect(container.textContent).toContain("Waiting for Claude");
    expect(capturedProps).toBeNull();

    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: layoutA }); });

    expect(container.textContent).not.toContain("Waiting for Claude");
    expect(capturedProps).toMatchObject({ workflow: "Pledge", content: "{}", layout: layoutA, layoutRev: 0, externalContent: null });
  });

  it("subscribes with a fresh per-tab origin", async () => {
    const App = await importApp();
    render(<App />);
    expect(typeof subscribedOrigin).toBe("string");
    expect(subscribedOrigin!.length).toBeGreaterThan(0);
  });

  // Clean viewer (no local edits reported via onDirtyChange): a content push
  // is applied by remounting the editor on the new content — the shown content
  // is swapped and NO banner (externalContent) is raised.
  it("on `content` for a clean viewer, swaps the shown content and raises no banner", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "original", layout: layoutA }); });

    act(() => { onEventCb?.({ type: "content", workflow: "Pledge", revision: 2, content: "claude-edited" }); });

    expect(capturedProps?.content).toBe("claude-edited");
    expect(capturedProps?.externalContent).toBeNull();
  });

  // Repeated clean pushes must ALL swap content (the bug the remount fixes:
  // applyExternalDocument left the session dirty, so only the first push
  // auto-applied and the 2nd+ wrongly raised the banner).
  it("on repeated `content` pushes for a clean viewer, each swaps the shown content with no banner", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "v0", layout: layoutA }); });

    act(() => { onEventCb?.({ type: "content", workflow: "Pledge", revision: 2, content: "v1" }); });
    expect(capturedProps?.content).toBe("v1");
    expect(capturedProps?.externalContent).toBeNull();

    act(() => { onEventCb?.({ type: "content", workflow: "Pledge", revision: 3, content: "v2" }); });
    expect(capturedProps?.content).toBe("v2");
    expect(capturedProps?.externalContent).toBeNull();
  });

  // Dirty viewer (EditorView reported local unsaved edits via onDirtyChange):
  // a content push must NOT clobber them — it raises the banner instead,
  // leaving the shown content untouched.
  it("on `content` for a dirty viewer, raises the banner without swapping the shown content", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "original", layout: layoutA }); });

    // Simulate EditorView reporting the human's unsaved local edits upward.
    act(() => { (capturedProps?.onDirtyChange as (d: boolean) => void)(true); });

    act(() => { onEventCb?.({ type: "content", workflow: "Pledge", revision: 2, content: "claude-edited" }); });

    expect(capturedProps?.content).toBe("original");
    expect(capturedProps?.externalContent).toBe("claude-edited");
  });

  it("ignores `content` events for a workflow other than the one shown", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "original", layout: layoutA }); });

    act(() => { onEventCb?.({ type: "content", workflow: "LegalEntity", revision: 2, content: "unrelated" }); });

    expect(capturedProps?.externalContent).toBeNull();
    expect(capturedProps?.content).toBe("original");
  });

  it("applies a `layout` event from another tab immediately when not dragging", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: layoutA }); });

    act(() => { onEventCb?.({ type: "layout", workflow: "Pledge", revision: 2, layout: layoutB, origin: "some-other-tab" }); });

    expect(capturedProps).toMatchObject({ layout: layoutB, layoutRev: 1 });
  });

  it("suppresses its own layout echo (event.origin === this tab's origin)", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: layoutA }); });

    act(() => { onEventCb?.({ type: "layout", workflow: "Pledge", revision: 2, layout: layoutB, origin: subscribedOrigin! }); });

    expect(capturedProps).toMatchObject({ layout: layoutA, layoutRev: 0 });
  });

  it("defers a mid-drag layout push and applies it on pointerup", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: layoutA }); });

    act(() => { window.dispatchEvent(new Event("pointerdown")); });
    act(() => { onEventCb?.({ type: "layout", workflow: "Pledge", revision: 2, layout: layoutB, origin: "other-tab" }); });

    // Still mid-drag: the human's local canvas must not be yanked out from under them.
    expect(capturedProps).toMatchObject({ layout: layoutA, layoutRev: 0 });

    act(() => { window.dispatchEvent(new Event("pointerup")); });

    expect(capturedProps).toMatchObject({ layout: layoutB, layoutRev: 1 });
  });

  it("ignores layout events for a workflow other than the one shown", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: layoutA }); });

    act(() => { onEventCb?.({ type: "layout", workflow: "LegalEntity", revision: 2, layout: layoutB, origin: "other-tab" }); });

    expect(capturedProps).toMatchObject({ layout: layoutA, layoutRev: 0 });
  });

  it("switching to a new `show` clears any pending externalContent banner state", async () => {
    const App = await importApp();
    render(<App />);
    act(() => { onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "original", layout: layoutA }); });
    // Dirty the viewer so the next content push raises the banner (rather than
    // remounting), giving us a pending externalContent to clear.
    act(() => { (capturedProps?.onDirtyChange as (d: boolean) => void)(true); });
    act(() => { onEventCb?.({ type: "content", workflow: "Pledge", revision: 2, content: "claude-edited" }); });
    expect(capturedProps?.externalContent).toBe("claude-edited");

    act(() => { onEventCb?.({ type: "show", workflow: "LegalEntity", revision: 3, content: "fresh", layout: layoutB }); });

    expect(capturedProps).toMatchObject({ workflow: "LegalEntity", content: "fresh", externalContent: null });
  });
});
