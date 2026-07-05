import { describe, it, expect } from "vitest";
import { mergeLayout, remapLayoutUuids, loadRemappedLayout } from "../layout.js";
import type { ToolContext } from "../context.js";

/** Minimal ToolContext whose `read` returns canned contents (or throws). `loadRemappedLayout`
 *  only ever touches `ctx.read`, so the rest is cast away. */
function ctxWithRead(read: (rel: string) => Promise<{ contents: string; lastModified: string; sizeBytes: number }>): ToolContext {
  return { read } as unknown as ToolContext;
}

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
  it("maps 2 old → 2 new by ordinal (a→x, b→y — never crosses)", () => {
    const workflowUi = { W: { transitionPositions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, edgeAnchors: { a: { source: "top" }, b: { source: "bottom" } } } } as never;
    const oldIds = { a: { workflow: "W", state: "s", transitionUuid: "a" }, b: { workflow: "W", state: "s", transitionUuid: "b" } };
    const newIds = { x: { workflow: "W", state: "s", transitionUuid: "x" }, y: { workflow: "W", state: "s", transitionUuid: "y" } };
    const out = remapLayoutUuids(workflowUi, oldIds, newIds);
    expect(out.W!.transitionPositions).toEqual({ x: { x: 1, y: 1 }, y: { x: 2, y: 2 } });
    expect(out.W!.edgeAnchors).toEqual({ x: { source: "top" }, y: { source: "bottom" } });
  });
});

describe("loadRemappedLayout", () => {
  const ENOENT = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });

  it("resolves to {} when the sidecar is missing (read rejects)", async () => {
    const ctx = ctxWithRead(() => Promise.reject(ENOENT));
    const out = await loadRemappedLayout(ctx, "Pledge.json", {});
    expect(out).toEqual({});
  });
  it("resolves to {} when the sidecar is corrupt JSON (graceful swallow)", async () => {
    const ctx = ctxWithRead(() => Promise.resolve({ contents: "{not json", lastModified: "", sizeBytes: 9 }));
    const out = await loadRemappedLayout(ctx, "Pledge.json", {});
    expect(out).toEqual({});
  });
  it("remaps transitionPositions/edgeAnchors to currentIds when _transitionIds is present", async () => {
    const sidecar = {
      _transitionIds: { old1: { workflow: "Pledge", state: "none", transitionUuid: "old1" } },
      Pledge: { transitionPositions: { old1: { x: 1, y: 1 } }, edgeAnchors: { old1: { source: "right" } } },
    };
    let requested = "";
    const ctx = ctxWithRead((rel) => { requested = rel; return Promise.resolve({ contents: JSON.stringify(sidecar), lastModified: "", sizeBytes: 0 }); });
    const currentIds = { new1: { workflow: "Pledge", state: "none", transitionUuid: "new1" } };
    const out = await loadRemappedLayout(ctx, "Pledge.json", currentIds);
    expect(requested).toBe("Pledge.layout.json");
    expect(out.Pledge!.transitionPositions).toEqual({ new1: { x: 1, y: 1 } });
    expect(out.Pledge!.edgeAnchors).toEqual({ new1: { source: "right" } });
    expect(out).not.toHaveProperty("_transitionIds");
  });
  it("returns the layout meta unremapped when _transitionIds is absent", async () => {
    const sidecar = { Pledge: { transitionPositions: { keepme: { x: 3, y: 4 } }, layout: { nodes: { none: { x: 0, y: 0 } } } } };
    const ctx = ctxWithRead(() => Promise.resolve({ contents: JSON.stringify(sidecar), lastModified: "", sizeBytes: 0 }));
    const currentIds = { new1: { workflow: "Pledge", state: "none", transitionUuid: "new1" } };
    const out = await loadRemappedLayout(ctx, "Pledge.json", currentIds);
    expect(out.Pledge!.transitionPositions).toEqual({ keepme: { x: 3, y: 4 } });
    expect(out.Pledge!.layout).toEqual({ nodes: { none: { x: 0, y: 0 } } });
    expect(out).not.toHaveProperty("_transitionIds");
  });
});
