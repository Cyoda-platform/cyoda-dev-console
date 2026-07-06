import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import type { ValidationIssue, WorkflowEditorDocument } from "@cyoda/workflow-core";
import { WorkflowEditor } from "@cyoda/workflow-react";
import { WorkflowEditorHostPanel } from "../WorkflowEditorHostPanel.js";
import type { EditorSession } from "../useEditorSession.js";

// The editor (and its reactflow CSS) is never rendered on the parse-failure
// path under test; stub it so the heavy dependency doesn't load in jsdom. A
// `vi.fn` (not a bare `() => null`) so the JSON-editor-gating tests below can
// read the props it was rendered with.
vi.mock("@cyoda/workflow-react", () => ({ WorkflowEditor: vi.fn(() => null) }));

const nullCriteriaRaw = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "w",
      initialState: "A",
      active: true,
      criterion: null,
      states: {
        A: { transitions: [{ name: "T", next: "B", manual: true, disabled: false, processors: [], criterion: null }] },
        B: { transitions: [] },
      },
    },
  ],
});

const error = (path: (string | number)[]): ValidationIssue => ({
  severity: "error",
  code: "schema-invalid_union",
  message: "Invalid input",
  detail: { path },
});

function makeSession(overrides: Partial<EditorSession>): EditorSession {
  return {
    document: null,
    issues: [],
    parseOk: false,
    dirty: false,
    saving: false,
    saveError: null,
    rawContent: "",
    setDocument: vi.fn(),
    applyExternalDocument: vi.fn(),
    externalRevision: 0,
    remediateNullCriteria: vi.fn(),
    canUndoAi: false,
    undoAiApply: vi.fn(),
    save: vi.fn(),
    revert: vi.fn(),
    layoutKey: "p:/tmp/wf.json",
    ...overrides,
  } as unknown as EditorSession;
}

function wrap(session: EditorSession) {
  return render(
    <ThemeProvider>
      <WorkflowEditorHostPanel session={session} />
    </ThemeProvider>,
  );
}

describe("WorkflowEditorHostPanel — null-criterion remediation", () => {
  it("shows the remediation popup when the parse failure is due to null criteria", () => {
    wrap(
      makeSession({
        rawContent: nullCriteriaRaw,
        issues: [error(["workflows", 0, "criterion"]), error(["workflows", 0, "states", "A", "transitions", 0, "criterion"])],
      }),
    );
    expect(screen.getByRole("button", { name: /drop null criteria/i })).toBeInTheDocument();
  });

  it("invokes remediateNullCriteria when the drop button is clicked", () => {
    const remediateNullCriteria = vi.fn();
    wrap(
      makeSession({
        rawContent: nullCriteriaRaw,
        issues: [error(["workflows", 0, "criterion"])],
        remediateNullCriteria,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /drop null criteria/i }));
    expect(remediateNullCriteria).toHaveBeenCalledTimes(1);
  });

  it("shows the generic parse-error view (no popup) for unrelated failures", () => {
    wrap(
      makeSession({
        rawContent: "{}",
        issues: [{ severity: "error", code: "schema-invalid_type", message: "Required", detail: { path: ["workflows", 0, "initialState"] } }],
      }),
    );
    expect(screen.getByText(/Workflow JSON could not be parsed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /drop null criteria/i })).not.toBeInTheDocument();
  });

  it("hides the popup after dismiss, leaving the parse-error view", () => {
    wrap(
      makeSession({
        rawContent: nullCriteriaRaw,
        issues: [error(["workflows", 0, "criterion"])],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("button", { name: /drop null criteria/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Workflow JSON could not be parsed/)).toBeInTheDocument();
  });
});

describe("WorkflowEditorHostPanel — editor JSON-tab gating", () => {
  // The editor's built-in JSON tab is only usable when a Monaco runtime is
  // supplied via `jsonEditorConfig.monaco`. Enabling the tab without one leaves
  // a JSON button that throws "Monaco runtime not configured" on click. So the
  // panel must only enable it when a config is actually provided (dev-console
  // passes one → editable JSON tab; the read-only MCP viewer passes none → no
  // built-in tab, its read-only JSON lives in a separate pane).
  beforeEach(() => vi.mocked(WorkflowEditor).mockClear());

  function renderValid(jsonEditorConfig?: unknown) {
    render(
      <ThemeProvider>
        <WorkflowEditorHostPanel
          session={makeSession({ parseOk: true, document: {} as unknown as WorkflowEditorDocument })}
          jsonEditorConfig={jsonEditorConfig as never}
        />
      </ThemeProvider>,
    );
    return vi.mocked(WorkflowEditor).mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
  }

  it("does NOT enable the editor's built-in JSON tab when no jsonEditorConfig is provided", () => {
    const props = renderValid(undefined);
    expect(props?.enableJsonEditor).toBe(false);
  });

  it("enables the editor's built-in JSON tab when a jsonEditorConfig is provided", () => {
    const config = { monaco: {} };
    const props = renderValid(config);
    expect(props?.enableJsonEditor).toBe(true);
    expect(props?.jsonEditor).toEqual(config);
  });
});
