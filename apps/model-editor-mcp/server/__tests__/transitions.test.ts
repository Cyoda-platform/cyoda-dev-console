import { describe, it, expect, vi } from "vitest";
import { updateTransitionTool, addTransitionTool, removeTransitionTool } from "../tools/transitions.js";
import { makeEditCtx, WF_FIXTURE } from "./_editHarness.js";

describe("update_transition", () => {
  it("merges provided fields, preserves the rest, writes canonical", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { disabled: true } }, ctx) as { structuredContent: { ok: boolean; name: string } };
    expect(r.structuredContent.ok).toBe(true);
    const written = JSON.parse((await ctx.read("Order.json")).contents);
    const t = written.workflows[0].states.draft.transitions[0];
    expect(t.disabled).toBe(true);
    expect(t.next).toBe("review"); // preserved
  });
  it("renames via patch.name and returns the new name", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { name: "send" } }, ctx) as { structuredContent: { name: string } };
    expect(r.structuredContent.name).toBe("send");
  });
  it("NOT_FOUND for an unknown transition, writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(updateTransitionTool({ workflow: "Order", state: "draft", name: "ghost", patch: {} }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    expect(w).not.toHaveBeenCalled();
  });
  it("C2: a malformed patch.criterion is VALIDATION_FAILED (not silently dropped), writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { criterion: { type: "bogus" } } }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
    expect(w).not.toHaveBeenCalled();
  });
  it("normalization parity: an operatorType-alias criterion is ACCEPTED (parseImport normalizes operatorType→operation)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { criterion: { type: "lifecycle", field: "state", operatorType: "EQUALS", value: "review" } } }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
  });
  it("warns (non-blocking) when a rename leaves a lifecycle previousTransition ref", async () => {
    const wf = JSON.parse(WF_FIXTURE);
    wf.workflows[0].states.done.transitions.push({ name: "reopen", next: "draft", manual: true, disabled: false, criterion: { type: "lifecycle", field: "previousTransition", operation: "EQUALS", value: "submit" } });
    const ctx = makeEditCtx({ "Order.json": JSON.stringify(wf) });
    const r = await updateTransitionTool({ workflow: "Order", state: "draft", name: "submit", patch: { name: "send" } }, ctx) as { structuredContent: { ok: boolean; diagnostics: { severity: string; code: string }[] } };
    expect(r.structuredContent.ok).toBe(true);
    expect(r.structuredContent.diagnostics.some((d) => d.severity === "warning" && d.code === "previous-transition-ref-not-cascaded")).toBe(true);
  });
});

describe("add_transition", () => {
  it("appends a new transition (with manual) and writes it", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "cancel", next: "done", manual: true } }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    const t = JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.draft.transitions;
    expect(t.map((x: { name: string }) => x.name)).toContain("cancel");
  });
  it("missing manual → INVALID_ARGS (schema requires it)", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "cancel", next: "done" } }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("INVALID_ARGS") }] });
  });
  it("ALREADY_EXISTS for a duplicate name, writing nothing", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const w = vi.spyOn(ctx, "write");
    await expect(addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "submit", next: "done", manual: true } }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("ALREADY_EXISTS") }] });
    expect(w).not.toHaveBeenCalled();
  });
  it("dangling next → VALIDATION_FAILED", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(addTransitionTool({ workflow: "Order", state: "draft", transition: { name: "cancel", next: "ghost", manual: true } }, ctx)).rejects.toMatchObject({ structuredContent: { code: "VALIDATION_FAILED" } });
  });
});

describe("remove_transition", () => {
  it("removes the addressed transition", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    const r = await removeTransitionTool({ workflow: "Order", state: "draft", name: "submit" }, ctx) as { structuredContent: { ok: boolean } };
    expect(r.structuredContent.ok).toBe(true);
    expect(JSON.parse((await ctx.read("Order.json")).contents).workflows[0].states.draft.transitions).toHaveLength(0);
  });
  it("NOT_FOUND for an unknown transition", async () => {
    const ctx = makeEditCtx({ "Order.json": WF_FIXTURE });
    await expect(removeTransitionTool({ workflow: "Order", state: "draft", name: "ghost" }, ctx)).rejects.toMatchObject({ content: [{ text: expect.stringContaining("NOT_FOUND") }] });
  });
});
