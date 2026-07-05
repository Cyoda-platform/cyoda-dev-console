import { describe, it, expect } from "vitest";
import { mergeLayout, remapLayoutUuids } from "../layout.js";

describe("mergeLayout", () => {
  it("overwrites only layout.nodes, preserving everything else", () => {
    const existing = {
      _transitionIds: { u1: { workflow: "wf", state: "A" } },
      wf: { layout: { nodes: { A: { x: 1, y: 1 } } }, transitionPositions: { u1: { x: 9, y: 9 } }, collapsedStates: ["Z"], comments: [{ id: "c1" }], viewPreset: "compact" },
    };
    const incoming = { wf: { layout: { nodes: { A: { x: 5, y: 5 }, B: { x: 6, y: 6 } } } } };
    const out = mergeLayout(existing, incoming) as typeof existing;
    expect(out.wf.layout.nodes).toEqual({ A: { x: 5, y: 5 }, B: { x: 6, y: 6 } });
    expect(out.wf.transitionPositions).toEqual({ u1: { x: 9, y: 9 } });
    expect(out.wf.collapsedStates).toEqual(["Z"]);
    expect(out.wf.comments).toEqual([{ id: "c1" }]);
    expect(out.wf.viewPreset).toEqual("compact");
    expect(out._transitionIds).toEqual(existing._transitionIds);
  });
  it("creates a fresh workflow entry when the workflow is new", () => {
    const out = mergeLayout({ _transitionIds: {} }, { wf: { layout: { nodes: { A: { x: 1, y: 2 } } } } }) as { wf: { layout: { nodes: unknown } } };
    expect(out.wf.layout.nodes).toEqual({ A: { x: 1, y: 2 } });
  });
  it("never lets incoming clobber _transitionIds", () => {
    const existing = { _transitionIds: { u1: { workflow: "wf", state: "A" } } };
    const out = mergeLayout(existing, { _transitionIds: { evil: "value" } }) as typeof existing;
    expect(out._transitionIds).toEqual(existing._transitionIds);
  });
});

describe("remapLayoutUuids", () => {
  it("re-keys transitionPositions/edgeAnchors old→new by ordinal within (workflow,state)", () => {
    const workflowUi = { Pledge: { transitionPositions: { old1: { x: 1, y: 1 } }, edgeAnchors: { old1: { source: "R", target: "L" } } } } as never;
    const oldIds = { old1: { workflow: "Pledge", state: "none", transitionUuid: "old1" } };
    const newIds = { new1: { workflow: "Pledge", state: "none", transitionUuid: "new1" } };
    const out = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(out.Pledge!.transitionPositions).toEqual({ new1: { x: 1, y: 1 } });
    expect(out.Pledge!.edgeAnchors).toEqual({ new1: { source: "R", target: "L" } });
  });
  it("returns the input unchanged when oldIds is empty", () => {
    const wf = { A: { transitionPositions: { x: { x: 0, y: 0 } } } } as never;
    expect(remapLayoutUuids(wf, {}, {})).toBe(wf);
  });
  it("keeps an old key (no orphan) when it has no new counterpart", () => {
    const workflowUi = { A: { transitionPositions: { old1: { x: 1, y: 1 }, old2: { x: 2, y: 2 } } } } as never;
    const oldIds = { old1: { workflow: "A", state: "s", transitionUuid: "old1" }, old2: { workflow: "A", state: "s", transitionUuid: "old2" } };
    const newIds = { new1: { workflow: "A", state: "s", transitionUuid: "new1" } };
    const out = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(out.A!.transitionPositions).toEqual({ new1: { x: 1, y: 1 }, old2: { x: 2, y: 2 } });
  });
});
