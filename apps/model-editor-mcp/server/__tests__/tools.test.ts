import { describe, it, expect, vi } from "vitest";
import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";
import { listWorkflowsTool } from "../tools/list.js";
import { showWorkflowTool } from "../tools/show.js";
import { validateWorkflowTool } from "../tools/validate.js";
import { updateWorkflowTool } from "../tools/update.js";

const PLEDGE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
});

/** Schema-valid but semantically invalid: `create` targets a state that does not exist. */
const DANGLING = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "ghost", manual: false, disabled: false }] } } }],
});

function entry(over: Partial<WorkflowFileIndexEntry> = {}): WorkflowFileIndexEntry {
  return { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1, ...over };
}

/** A ToolContext backed by an in-memory file map + the REAL workflow-core parse/serialize/validate. */
function ctx(files: Record<string, string>, over: Partial<ToolContext> = {}): ToolContext {
  const writes: Record<string, string> = {};
  return {
    root: "/r",
    workflowGlobs: ["**/*.json"],
    connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => {
      const c = writes[rel] ?? files[rel];
      if (c === undefined) throw new Error("not found");
      return { contents: c, lastModified: "t", sizeBytes: c.length };
    }),
    write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
    discover: vi.fn(async () => [entry()]),
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
    ...over,
  };
}

describe("listWorkflowsTool", () => {
  it("returns { workflows: [{ name, path, states, transitions, valid }] } per discovered workflow", async () => {
    const r = await listWorkflowsTool({}, ctx({ "Pledge.json": PLEDGE }));
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text)).toEqual({ workflows: [{ name: "Pledge", path: "Pledge.json", states: 2, transitions: 1, valid: true }] });
  });
  it("rejects unknown args", async () => {
    await expect(listWorkflowsTool({ x: 1 }, ctx({}))).rejects.toMatchObject({ isError: true });
  });
});

describe("showWorkflowTool", () => {
  it("returns the canonical document and calls setShown with content + remapped layout", async () => {
    const setShown = vi.fn();
    const r = await showWorkflowTool({ name: "Pledge" }, ctx({ "Pledge.json": PLEDGE }), setShown);
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0]!.text);
    expect(out.name).toBe("Pledge");
    expect(out.content).toContain('"workflows"');
    expect(setShown).toHaveBeenCalledWith(expect.objectContaining({ workflow: "Pledge", content: expect.stringContaining("Pledge") }));
  });
  it("throws NOT_FOUND for an unknown name", async () => {
    await expect(showWorkflowTool({ name: "Nope" }, ctx({ "Pledge.json": PLEDGE }), vi.fn())).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
  });
});

describe("validateWorkflowTool", () => {
  it("reports valid:true with no error diagnostics for a good workflow", async () => {
    const r = await validateWorkflowTool({ name: "Pledge" }, ctx({ "Pledge.json": PLEDGE }));
    const out = JSON.parse(r.content[0]!.text);
    expect(out.valid).toBe(true);
    expect(out.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toHaveLength(0);
  });
  it("emits each non-error diagnostic exactly once (no dedup double-emit)", async () => {
    // `created` is a terminal, non-initial state → one `terminal-state-derived` info.
    const r = await validateWorkflowTool({ name: "Pledge" }, ctx({ "Pledge.json": PLEDGE }));
    const out = JSON.parse(r.content[0]!.text) as { diagnostics: Array<{ code: string; severity: string }> };
    expect(out.diagnostics.filter((d) => d.code === "terminal-state-derived")).toHaveLength(1);
  });
  it("throws NOT_FOUND for an unknown name", async () => {
    await expect(validateWorkflowTool({ name: "Nope" }, ctx({ "Pledge.json": PLEDGE }))).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
  });
});

describe("updateWorkflowTool", () => {
  it("writes canonical JSON and returns a diff on success", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const renamed = JSON.parse(PLEDGE);
    renamed.workflows[0].name = "Pledge2";
    const r = await updateWorkflowTool({ name: "Pledge", content: JSON.stringify(renamed) }, c);
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0]!.text);
    expect(out.ok).toBe(true);
    expect(out.diff).toContainEqual({ op: "replace", path: "/workflows/0/name", value: "Pledge2" });
    expect(c.write).toHaveBeenCalledWith("Pledge.json", expect.stringContaining("Pledge2"));
  });
  it("rejects invalid JSON without writing", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    await expect(updateWorkflowTool({ name: "Pledge", content: "{bad" }, c)).rejects.toMatchObject({ isError: true });
    expect(c.write).not.toHaveBeenCalled();
  });
  it("returns VALIDATION_FAILED (isError, no write) when content is not a parseable workflow", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const r = await updateWorkflowTool({ name: "Pledge", content: '{"foo":"bar"}' }, c);
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { code: string }).code).toBe("VALIDATION_FAILED");
    expect(c.write).not.toHaveBeenCalled();
  });
  it("rejects a semantically-invalid (dangling target) workflow without writing, error listed once", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const r = await updateWorkflowTool({ name: "Pledge", content: DANGLING }, c);
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { code: string }).code).toBe("VALIDATION_FAILED");
    expect(c.write).not.toHaveBeenCalled();
    const diags = (r.structuredContent as { diagnostics: Array<{ code: string; severity: string }> }).diagnostics;
    const dangling = diags.filter((d) => d.code === "unknown-transition-target");
    expect(dangling).toHaveLength(1); // deduped: pre-fix this appeared twice
    expect(dangling[0]!.severity).toBe("error");
  });
  it("throws NOT_FOUND for an unknown name without writing", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    await expect(updateWorkflowTool({ name: "Nope", content: PLEDGE }, c)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
    expect(c.write).not.toHaveBeenCalled();
  });
});
