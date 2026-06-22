import { describe, it, expect } from "vitest";
import type { WorkflowUiMeta, TransitionPointer } from "@cyoda/workflow-core";
import { remapLayoutUuids } from "../routes/workflow.js";

describe("remapLayoutUuids", () => {
  const OLD_UUID_1 = "old-1";
  const OLD_UUID_2 = "old-2";
  const NEW_UUID_1 = "new-1";
  const NEW_UUID_2 = "new-2";

  const oldIds: Record<string, TransitionPointer> = {
    [OLD_UUID_1]: { workflow: "wf", state: "INITIAL", transitionUuid: OLD_UUID_1 },
    [OLD_UUID_2]: { workflow: "wf", state: "INITIAL", transitionUuid: OLD_UUID_2 },
  };

  const newIds: Record<string, TransitionPointer> = {
    [NEW_UUID_1]: { workflow: "wf", state: "INITIAL", transitionUuid: NEW_UUID_1 },
    [NEW_UUID_2]: { workflow: "wf", state: "INITIAL", transitionUuid: NEW_UUID_2 },
  };

  it("remaps transitionPositions keys from old to new UUIDs", () => {
    const workflowUi: Record<string, WorkflowUiMeta> = {
      wf: {
        transitionPositions: {
          [OLD_UUID_1]: { x: 10, y: 20 },
          [OLD_UUID_2]: { x: 30, y: 40 },
        },
      },
    };
    const result = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(result["wf"].transitionPositions).toEqual({
      [NEW_UUID_1]: { x: 10, y: 20 },
      [NEW_UUID_2]: { x: 30, y: 40 },
    });
  });

  it("remaps edgeAnchors keys from old to new UUIDs", () => {
    const workflowUi: Record<string, WorkflowUiMeta> = {
      wf: {
        edgeAnchors: {
          [OLD_UUID_1]: { source: "top", target: "bottom" },
        },
      },
    };
    const result = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(result["wf"].edgeAnchors).toEqual({
      [NEW_UUID_1]: { source: "top", target: "bottom" },
    });
  });

  it("preserves keys that have no mapping", () => {
    const workflowUi: Record<string, WorkflowUiMeta> = {
      wf: { transitionPositions: { "unknown-uuid": { x: 5, y: 5 } } },
    };
    const result = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(result["wf"].transitionPositions?.["unknown-uuid"]).toEqual({ x: 5, y: 5 });
  });

  it("preserves other WorkflowUiMeta fields unchanged", () => {
    const workflowUi: Record<string, WorkflowUiMeta> = {
      wf: {
        layout: { nodes: { INITIAL: { x: 1, y: 2 } } },
        transitionPositions: { [OLD_UUID_1]: { x: 10, y: 20 } },
      },
    };
    const result = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(result["wf"].layout).toEqual({ nodes: { INITIAL: { x: 1, y: 2 } } });
  });

  it("returns workflowUi unchanged when oldIds is empty", () => {
    const workflowUi: Record<string, WorkflowUiMeta> = {
      wf: { transitionPositions: { [OLD_UUID_1]: { x: 10, y: 20 } } },
    };
    const result = remapLayoutUuids(workflowUi, {}, newIds);
    expect(result).toEqual(workflowUi);
  });
});
