import { describe, it, expect, vi } from "vitest";
import { loadWorkflowForEdit, commitEditedWorkflow, walkCriteria, cascadeStateRename, hasLifecycleStateRef, hasPreviousTransitionRef } from "../tools/edit_common.js";
import { makeEditCtx, WF_FIXTURE } from "./_editHarness.js";
import type { Criterion } from "@cyoda/workflow-core";

describe("loadWorkflowForEdit", () => {
  it("resolves the file + target workflow", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    expect(loaded.workflow.name).toBe("Order");
    expect(Object.keys(loaded.workflow.states)).toEqual(["draft", "review", "done"]);
  });
  it("throws NOT_FOUND for an unknown workflow", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(loadWorkflowForEdit(ctx, "Nope")).rejects.toMatchObject({ isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] });
  });
});

describe("commitEditedWorkflow", () => {
  it("writes canonical + returns a diff on a valid mutation", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    loaded.workflow.states.draft!.transitions[0]!.disabled = true;
    const w = vi.spyOn(ctx, "write");
    const r = await commitEditedWorkflow(ctx, loaded);
    expect(w).toHaveBeenCalledTimes(1);
    expect(JSON.parse((w.mock.calls[0]![1]))).toBeTruthy();
    expect(r.path).toBe("Order.json");
  });
  it("C2: a malformed criterion is REJECTED (not silently dropped), writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    // inject a structurally-invalid criterion (unknown type)
    (loaded.workflow.states.draft!.transitions[0] as unknown as { criterion: unknown }).criterion = { type: "bogus", nope: 1 };
    const w = vi.spyOn(ctx, "write");
    await expect(commitEditedWorkflow(ctx, loaded)).rejects.toMatchObject({ isError: true, structuredContent: { code: "VALIDATION_FAILED" } });
    expect(w).not.toHaveBeenCalled();
  });
  it("rejects a dangling next (semantic gate)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const loaded = await loadWorkflowForEdit(ctx, "Order");
    loaded.workflow.states.draft!.transitions[0]!.next = "ghost";
    await expect(commitEditedWorkflow(ctx, loaded)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
  });
});

describe("walkCriteria", () => {
  it("visits nodes nested under group.conditions AND function.function.criterion", () => {
    const seen: string[] = [];
    const c: Criterion = { type: "group", operator: "AND", conditions: [
      { type: "lifecycle", field: "state", operation: "EQUALS", value: "a" },
      { type: "function", function: { name: "f", criterion: { type: "lifecycle", field: "state", operation: "EQUALS", value: "b" } } },
    ] };
    walkCriteria(c, (n) => { if (n.type === "lifecycle") seen.push(String(n.value)); });
    expect(seen.sort()).toEqual(["a", "b"]);
  });
});

describe("cascadeStateRename", () => {
  it("rewrites next, initialState, and lifecycle state-criteria (incl. nested + array), preserving key order", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const { workflow } = await loadWorkflowForEdit(ctx, "Order");
    // add an array-valued lifecycle state ref nested in a group, on the submit transition
    workflow.states.draft!.transitions[0]!.criterion = { type: "group", operator: "OR", conditions: [
      { type: "lifecycle", field: "state", operation: "EQUALS", value: ["draft", "done"] },
    ] };
    cascadeStateRename(workflow, "draft", "cart");
    expect(Object.keys(workflow.states)).toEqual(["cart", "review", "done"]); // order preserved, key substituted in place
    expect(workflow.initialState).toBe("cart");
    // the review→done transition's lifecycle value "draft" → "cart"
    expect((workflow.states.review!.transitions[0]!.criterion as { value: string }).value).toBe("cart");
    // the array-valued nested one: "draft" → "cart", "done" untouched
    const grp = workflow.states.cart!.transitions[0]!.criterion as { conditions: { value: string[] }[] };
    expect(grp.conditions[0]!.value).toEqual(["cart", "done"]);
  });
});

describe("ref scans", () => {
  it("hasLifecycleStateRef finds a state referenced by a lifecycle criterion", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const { workflow } = await loadWorkflowForEdit(ctx, "Order");
    expect(hasLifecycleStateRef(workflow, "draft")).toBe(true); // review→approve criterion references "draft"
    expect(hasLifecycleStateRef(workflow, "review")).toBe(false);
  });
  it("hasPreviousTransitionRef finds a transition referenced by a lifecycle previousTransition criterion", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const { workflow } = await loadWorkflowForEdit(ctx, "Order");
    workflow.states.done!.transitions.push({ name: "reopen", next: "draft", manual: true, disabled: false,
      criterion: { type: "lifecycle", field: "previousTransition", operation: "EQUALS", value: "submit" } } as never);
    expect(hasPreviousTransitionRef(workflow, "submit")).toBe(true);
    expect(hasPreviousTransitionRef(workflow, "approve")).toBe(false);
  });
});
