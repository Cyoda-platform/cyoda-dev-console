import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { serializeImportPayload } from "@cyoda/workflow-core";
import { useEditorSession } from "../useEditorSession.js";

/**
 * cyoda-go introduced an optional `annotations` field on workflow
 * configuration — at the workflow root, on each state, and on each transition.
 * It is client-owned metadata that the engine never interprets
 * (see `cyoda help workflows`).
 *
 * As of `@cyoda/workflow-core` 0.4.0, `annotations` is a first-class field on the
 * Workflow/State/Transition domain model: the parser keeps it (rather than
 * stripping it as an unknown key) and the serializer re-emits it at the 0.8
 * dialect — which is the dialect the host always parses/serializes at, since it
 * never overrides `sourceVersion`. These tests guard both halves:
 *
 * 1. Tolerance — an annotated workflow still renders. `parseOk === true &&
 *    document !== null` is the host's render predicate: WorkflowEditorHostPanel
 *    shows ParseErrorView only when `!parseOk || !document`, otherwise it renders
 *    the editor. Asserting both is the established proxy for "this workflow
 *    renders" (same convention as standalone.test.ts).
 * 2. Preservation — annotations survive a parse -> serialize round-trip at every
 *    level, so a future dependency bump can't silently start dropping them.
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

describe("useEditorSession — annotations tolerance and preservation", () => {
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

  // Full support (implemented in @cyoda/workflow-core 0.4.0): annotations survive
  // an import -> edit -> save round-trip instead of being silently dropped. The
  // session serializes via serializeImportPayload, so re-parsing its output is a
  // faithful proxy for what `save()` writes to disk.
  it("preserves annotations at root, state, and transition through a round-trip", () => {
    const { result } = openSession(annotatedPayload);
    expect(result.current.document).not.toBeNull();

    const roundTripped = JSON.parse(serializeImportPayload(result.current.document!));
    const wf = roundTripped.workflows[0];

    expect(wf.annotations).toEqual({ roles: ["reviewer"], label: "Prize lifecycle" });
    expect(wf.states.NEW.annotations).toEqual({ ui: { collapsed: false } });
    expect(wf.states.NEW.transitions[0].annotations).toEqual({ ui: { color: "green" } });
  });
});
