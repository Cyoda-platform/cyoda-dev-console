import { describe, it, expect } from "vitest";
import {
  listWorkflowsInput, showWorkflowInput, updateWorkflowInput,
  optimizeLayoutInput, validateWorkflowInput, connectionInfoInput, layoutPostBody,
} from "../schemas.js";

describe("listWorkflowsInput / connectionInfoInput", () => {
  it("accept the empty object and reject unknown props", () => {
    expect(listWorkflowsInput.safeParse({}).success).toBe(true);
    expect(connectionInfoInput.safeParse({}).success).toBe(true);
    expect(listWorkflowsInput.safeParse({ x: 1 }).success).toBe(false);
  });
});

describe("showWorkflowInput / validateWorkflowInput", () => {
  it("require a non-empty name", () => {
    expect(showWorkflowInput.safeParse({ name: "Pledge" }).success).toBe(true);
    expect(validateWorkflowInput.safeParse({ name: "Pledge" }).success).toBe(true);
    expect(showWorkflowInput.safeParse({ name: "" }).success).toBe(false);
    expect(showWorkflowInput.safeParse({}).success).toBe(false);
    expect(showWorkflowInput.safeParse({ name: "P", extra: 1 }).success).toBe(false);
  });
});

describe("updateWorkflowInput", () => {
  it("requires name + content (string), no JSON validation here", () => {
    expect(updateWorkflowInput.safeParse({ name: "P", content: "{not json" }).success).toBe(true);
    expect(updateWorkflowInput.safeParse({ name: "P" }).success).toBe(false);
    expect(updateWorkflowInput.safeParse({ content: "{}" }).success).toBe(false);
  });
});

describe("optimizeLayoutInput", () => {
  it("accepts name alone and a full options object", () => {
    expect(optimizeLayoutInput.safeParse({ name: "P" }).success).toBe(true);
    const ok = optimizeLayoutInput.safeParse({
      name: "P",
      options: { orientation: "horizontal", preset: "opsAudit", nodeSize: { width: 160, height: 72 }, pinned: [{ id: "s1", x: 0, y: 0 }] },
    });
    expect(ok.success).toBe(true);
  });
  it("rejects unknown option keys (no `direction`, no `spacing`)", () => {
    expect(optimizeLayoutInput.safeParse({ name: "P", options: { direction: "TB" } }).success).toBe(false);
    expect(optimizeLayoutInput.safeParse({ name: "P", options: { spacing: 20 } }).success).toBe(false);
  });
});

describe("layoutPostBody", () => {
  it("accepts { name, workflowUi } and rejects a missing workflowUi", () => {
    expect(layoutPostBody.safeParse({ name: "P", workflowUi: { P: { layout: { nodes: {} } } } }).success).toBe(true);
    expect(layoutPostBody.safeParse({ name: "P" }).success).toBe(false);
  });
});
