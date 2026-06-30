import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorSession } from "../useEditorSession.js";

/**
 * cyoda-go introduced an optional `annotations` field on workflow
 * configuration — at the workflow root, on each state, and on each transition.
 * It is client-owned metadata that the engine never interprets
 * (see `cyoda help workflows`).
 *
 * Step one of supporting it is purely tolerance: the editor must keep rendering
 * a workflow that carries `annotations`. The underlying `@cyoda/workflow-core`
 * parser uses lenient `z.object()` schemas, so unknown fields are *stripped*,
 * not rejected — these tests guard that contract so a future dependency bump
 * can't silently start failing to render annotated workflows.
 *
 * `parseOk === true && document !== null` is the host's render predicate:
 * WorkflowEditorHostPanel shows ParseErrorView only when `!parseOk || !document`,
 * otherwise it renders the editor. So asserting both is the established proxy
 * for "this workflow renders" (same convention as standalone.test.ts).
 *
 * NOTE: annotations are currently dropped on parse and on save — round-trip
 * *preservation* is the later "full support" step and lives in workflow-core,
 * not here (see the it.todo at the bottom).
 */

// Annotations at every level the cyoda-go schema allows: workflow root, state,
// and transition.
const annotatedWorkflow = {
  version: "1.1",
  name: "prize-lifecycle",
  desc: "State machine for Nobel Prize entities",
  initialState: "NEW",
  active: true,
  annotations: { roles: ["reviewer"], label: "Prize lifecycle" },
  states: {
    NEW: {
      annotations: { ui: { collapsed: false } },
      transitions: [
        {
          name: "APPROVE",
          next: "APPROVED",
          manual: true,
          disabled: false,
          annotations: { ui: { color: "green" } },
          processors: [],
        },
      ],
    },
    APPROVED: { transitions: [] },
  },
};

// Canonical import-payload shape (`workflows: [...]`), which is what the
// installed @cyoda/workflow-core supports. (The standalone "block-portal" shape
// is a separate, pre-existing concern covered by standalone.test.ts.)
const annotatedPayload = JSON.stringify({
  importMode: "MERGE",
  workflows: [annotatedWorkflow],
});

const io = () => ({ write: vi.fn(), read: vi.fn() });

const openSession = (initialContents: string) =>
  renderHook(() =>
    useEditorSession({
      projectId: "p",
      filePath: "/tmp/wf.json",
      initialContents,
      io: io(),
    }),
  );

describe("useEditorSession — annotations tolerance", () => {
  it("renders a workflow that carries annotations at root, state, and transition", () => {
    const { result } = openSession(annotatedPayload);
    // render predicate: ParseErrorView is shown only when !parseOk || !document.
    expect(result.current.parseOk).toBe(true);
    expect(result.current.document).not.toBeNull();
  });

  it("reports no parse errors for an annotated workflow", () => {
    const { result } = openSession(annotatedPayload);
    const errors = result.current.issues.filter((issue) => issue.severity === "error");
    expect(errors).toEqual([]);
  });

  // Full support (a later step, implemented in @cyoda/workflow-core): preserve
  // annotations through an import -> edit -> save round-trip instead of
  // silently dropping them.
  it.todo("preserves annotations on round-trip (full support — not yet implemented)");
});
