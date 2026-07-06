import { describe, it, expect, vi } from "vitest";
import { addStateTool, removeStateTool, renameStateTool } from "../tools/states.js";
import { makeEditCtx, WF_FIXTURE } from "./_editHarness.js";

describe("add_state", () => {
  it("adds an empty state", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await addStateTool({ workflow: "Order", code: "archived" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.archived).toEqual({ transitions: [] });
  });
  it("adds a state seeded with a transition (requires manual)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await addStateTool({ workflow: "Order", code: "hold", state: { transitions: [{ name: "resume", next: "draft", manual: true }] } }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
  });
  it("ALREADY_EXISTS for a duplicate code, writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(addStateTool({ workflow: "Order", code: "draft" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("ALREADY_EXISTS") }] });
    expect(w).not.toHaveBeenCalled();
  });
  it("seeded transition with a dangling next → VALIDATION_FAILED", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(addStateTool({ workflow: "Order", code: "hold", state: { transitions: [{ name: "x", next: "ghost", manual: true }] } }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
  });
});

describe("remove_state", () => {
  it("removes a state with no dangling references", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    // "done" is referenced by approve.next — remove a leaf we can safely delete: add + remove
    await addStateTool({ workflow: "Order", code: "archived" }, ctx);
    const r = await removeStateTool({ workflow: "Order", code: "archived" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.archived).toBeUndefined();
  });
  it("NOT_FOUND for an unknown code", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(removeStateTool({ workflow: "Order", code: "ghost" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
  });
  it("dangling next → VALIDATION_FAILED (semantic gate) — removing a state a transition targets", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(removeStateTool({ workflow: "Order", code: "review" }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } }); // submit.next === "review"
  });
  it("C1: rejects via the lifecycle GUARD (not the semantic gate) when ONLY a lifecycle criterion references the code", async () => {
    // Isolate the guard: a leaf state "shipped" referenced SOLELY by a lifecycle criterion —
    // nothing next-points to it, it is not initialState — so the semantic gate would NOT catch it.
    // (If the C1 guard were removed, remove would succeed and write would be called — this test catches that regression.)
    const wf = JSON.parse(WF_FIXTURE);
    wf.workflows[0].states.shipped = { transitions: [] };
    wf.workflows[0].states.review.transitions[0].criterion = { type: "lifecycle", field: "state", operation: "EQUALS", value: "shipped" };
    const ctx = makeEditCtx({ "Order.json": JSON.stringify(wf) });
    const w = vi.spyOn(ctx, "write");
    const r = await removeStateTool({ workflow: "Order", code: "shipped" }, ctx).catch((e) => e as { structuredContent?: { code?: string; diagnostics?: { code: string }[] } });
    expect(r).toMatchObject({ structuredContent: { code: "VALIDATION_FAILED", diagnostics: [{ code: "state-referenced-by-lifecycle-criterion" }] } });
    expect(w).not.toHaveBeenCalled();
  });
});

describe("rename_state", () => {
  it("cascades next + initialState + lifecycle state-criteria and migrates the sidecar node", async () => {
    const ctx = makeEditCtx({
      "Order.json": WF_FIXTURE,
      "Order.layout.json": JSON.stringify({ Order: { layout: { nodes: { draft: { x: 5, y: 6 }, review: { x: 7, y: 8 } } } } }),
    });
    const r = await renameStateTool({ workflow: "Order", oldCode: "draft", newCode: "cart" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    const wf = JSON.parse((await ctx.read("Order.json")).contents).workflows[0];
    expect(wf.initialState).toBe("cart");
    expect(Object.keys(wf.states)).toEqual(["cart", "review", "done"]); // order preserved
    expect(wf.states.review.transitions[0].criterion.value).toBe("cart"); // lifecycle value cascaded
    const side = JSON.parse((await ctx.read("Order.layout.json")).contents);
    expect(side.Order.layout.nodes.cart).toEqual({ x: 5, y: 6 });
    expect(side.Order.layout.nodes.draft).toBeUndefined();
  });
  it("NOT_FOUND for an unknown oldCode; ALREADY_EXISTS if newCode exists", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(renameStateTool({ workflow: "Order", oldCode: "ghost", newCode: "x" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    await expect(renameStateTool({ workflow: "Order", oldCode: "draft", newCode: "review" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("ALREADY_EXISTS") }] });
  });
});
