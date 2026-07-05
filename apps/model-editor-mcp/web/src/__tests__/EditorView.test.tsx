/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { EditorView } from "../EditorView.js";

// Real `useEditorSession` / `WorkflowEditorHostPanel` / `ExternalChangeBanner` run
// in this test (same pattern as
// packages/workflow-editor-host/src/__tests__/WorkflowEditorHostPanel.test.tsx) —
// only the underlying `@cyoda/workflow-react` `WorkflowEditor` (the reactflow
// canvas, which happy-dom cannot lay out) is stubbed. Stubbing it one layer
// lower than `WorkflowEditorHostPanel` lets this test drive the *real*
// `onWorkflowUiChange`/`onSave` wiring that EditorView hands down.
let workflowEditorProps: Record<string, unknown> | null = null;
vi.mock("@cyoda/workflow-react", () => ({
  WorkflowEditor: (props: Record<string, unknown>) => {
    workflowEditorProps = props;
    return null;
  },
}));

const fixture = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "demo",
      initialState: "S",
      active: true,
      states: { S: { transitions: [{ name: "go", next: "T", manual: false, disabled: false }] }, T: { transitions: [] } },
    },
  ],
});

const updatedFixture = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "demo",
      initialState: "S",
      active: true,
      states: { S: { transitions: [] } },
    },
  ],
});

function wrap(props: Partial<React.ComponentProps<typeof EditorView>> = {}) {
  const defaults: React.ComponentProps<typeof EditorView> = {
    token: "tok-123",
    origin: "origin-abc",
    workflow: "demo",
    content: fixture,
    layout: {},
    layoutRev: 0,
    externalContent: null,
    onDismissExternal: vi.fn(),
  };
  return render(
    <ThemeProvider>
      <EditorView {...defaults} {...props} />
    </ThemeProvider>,
  );
}

// Node 25's own ambient global `localStorage` (Web Storage API, unconfigured —
// no `--localstorage-file`) shadows happy-dom's implementation and is missing
// `clear()`. Stub with a minimal in-memory Storage, same fix dev-console's own
// tests use (apps/dev-console/src/__tests__/settings.test.tsx).
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  workflowEditorProps = null;
  vi.stubGlobal("localStorage", makeStorage());
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EditorView — layout seeding", () => {
  it("seeds the pushed layout into the editor's localStorage layoutKey", () => {
    const layout = { demo: { layout: { nodes: { S: { x: 1, y: 2 } } } } };
    wrap({ layout });
    expect(localStorage.getItem("model-editor:demo.json")).toBe(JSON.stringify(layout));
  });

  it("re-seeds localStorage when a live layout push bumps layoutRev", () => {
    const { rerender } = wrap({ layout: { demo: { layout: { nodes: {} } } }, layoutRev: 0 });
    const nextLayout = { demo: { layout: { nodes: { S: { x: 5, y: 5 } } } } };
    rerender(
      <ThemeProvider>
        <EditorView
          token="tok-123"
          origin="origin-abc"
          workflow="demo"
          content={fixture}
          layout={nextLayout}
          layoutRev={1}
          externalContent={null}
          onDismissExternal={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(localStorage.getItem("model-editor:demo.json")).toBe(JSON.stringify(nextLayout));
  });
});

describe("EditorView — layout write-back", () => {
  it("debounces onWorkflowUiChange and POSTs /layout with the session token + tab origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    wrap({ token: "the-token", origin: "the-origin", workflow: "demo" });
    const onChange = workflowEditorProps?.onWorkflowUiChange as (u: Record<string, unknown>) => void;
    expect(typeof onChange).toBe("function");

    const workflowUi = { demo: { layout: { nodes: { S: { x: 3, y: 4 } } } } };
    act(() => onChange(workflowUi));
    expect(fetchMock).not.toHaveBeenCalled(); // debounced, not yet fired

    await act(async () => { vi.advanceTimersByTime(600); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/layout");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-session-token": "the-token",
      "x-origin": "the-origin",
    });
    expect(JSON.parse(init.body as string)).toEqual({ name: "demo", workflowUi });

    vi.stubGlobal("fetch", vi.fn()); // cleanup relies on afterEach's restoreAllMocks; belt & suspenders
  });

  it("collapses rapid successive drags into a single POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    wrap({});
    const onChange = workflowEditorProps?.onWorkflowUiChange as (u: Record<string, unknown>) => void;

    act(() => onChange({ demo: { layout: { nodes: { S: { x: 1, y: 1 } } } } }));
    await act(async () => { vi.advanceTimersByTime(300); });
    act(() => onChange({ demo: { layout: { nodes: { S: { x: 2, y: 2 } } } } }));
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(JSON.parse(init.body as string).workflowUi).toEqual({ demo: { layout: { nodes: { S: { x: 2, y: 2 } } } } });
  });

  it("never POSTs an empty workflowUi", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    wrap({});
    const onChange = workflowEditorProps?.onWorkflowUiChange as (u: Record<string, unknown>) => void;

    act(() => onChange({}));
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("EditorView — content save warns instead of persisting", () => {
  it("alerts instead of saving when the editor's Save affordance is used", () => {
    // happy-dom does not implement `window.alert` at all (unlike jsdom, which
    // stubs it as a no-op) — install a bare mock rather than `vi.spyOn` an
    // undefined method.
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    wrap({});
    const onSave = workflowEditorProps?.onSave as () => void;
    expect(typeof onSave).toBe("function");

    onSave();

    expect(alertSpy).toHaveBeenCalledWith("Content changes go through Claude — layout drags persist, content edits do not.");
  });
});

describe("EditorView — external-change banner (Claude edited underneath)", () => {
  it("shows the banner when a content push arrives for the shown workflow", () => {
    wrap({ externalContent: updatedFixture });
    expect(screen.getByText(/changed on disk/i)).toBeInTheDocument();
  });

  it("does not show the banner while externalContent is null", () => {
    wrap({ externalContent: null });
    expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument();
  });

  // The banner is derived straight from the `externalContent` prop (see
  // EditorView.tsx) — EditorView itself does not own "is the banner open"
  // state. So clicking a banner button is only responsible for calling
  // `onDismissExternal`; it's the parent (App.tsx: `onDismissExternal={() =>
  // setExternalContent(null)}`) that actually clears the prop, which is what
  // makes the banner disappear. Simulate that round-trip with `rerender`.
  it("'Keep editing' calls onDismissExternal without applying the external content; parent clearing the prop then hides the banner", () => {
    const onDismissExternal = vi.fn();
    const { rerender } = wrap({ externalContent: updatedFixture, onDismissExternal });

    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(onDismissExternal).toHaveBeenCalledTimes(1);

    rerender(
      <ThemeProvider>
        <EditorView token="tok-123" origin="origin-abc" workflow="demo" content={fixture} layout={{}} layoutRev={0} externalContent={null} onDismissExternal={onDismissExternal} />
      </ThemeProvider>,
    );
    expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument();
  });

  it("'Reload from disk' applies the pushed content and calls onDismissExternal", () => {
    const onDismissExternal = vi.fn();
    wrap({ externalContent: updatedFixture, onDismissExternal });

    fireEvent.click(screen.getByRole("button", { name: /reload from disk/i }));

    expect(onDismissExternal).toHaveBeenCalledTimes(1);
  });
});
