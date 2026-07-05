import { describe, it, expect, vi } from "vitest";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";
import { optimizeLayoutTool } from "../tools/optimize_layout.js";

const PLEDGE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
});

function ctx(files: Record<string, string>): ToolContext {
  const real = require("@cyoda/workflow-core");
  const writes: Record<string, string> = {};
  const entry: WorkflowFileIndexEntry = { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1 };
  return {
    root: "/r", workflowGlobs: ["**/*.json"], connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => { const c = writes[rel] ?? files[rel]; if (c === undefined) throw new Error("nf"); return { contents: c, lastModified: "t", sizeBytes: c.length }; }),
    write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
    discover: vi.fn(async () => [entry]),
    parseImport: real.parseImportPayload, serializeImport: real.serializeImportPayload, validate: real.validateAll,
  };
}

describe("optimizeLayoutTool", () => {
  it("lays out via ELK and merges { x, y } per state code into the sidecar", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const r = await optimizeLayoutTool({ name: "Pledge", options: { orientation: "vertical" } }, c);
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0]!.text);
    expect(out.path).toBe("Pledge.layout.json");
    expect(Object.keys(out.positions.Pledge.layout.nodes).sort()).toEqual(["created", "none"]);
    for (const pos of Object.values(out.positions.Pledge.layout.nodes) as Array<{ x: number; y: number }>) {
      expect(typeof pos.x).toBe("number");
      expect(typeof pos.y).toBe("number");
    }
    expect(c.write).toHaveBeenCalledWith("Pledge.layout.json", expect.stringContaining('"nodes"'));
  });
  it("preserves existing sibling sidecar fields via mergeLayout", async () => {
    const c = ctx({ "Pledge.json": PLEDGE, "Pledge.layout.json": JSON.stringify({ _transitionIds: { u: { workflow: "Pledge", state: "none" } }, Pledge: { transitionPositions: { u: { x: 9, y: 9 } } } }) });
    await optimizeLayoutTool({ name: "Pledge" }, c);
    const written = JSON.parse((c.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![1] as string);
    expect(written.Pledge.transitionPositions).toEqual({ u: { x: 9, y: 9 } });
    expect(written._transitionIds).toEqual({ u: { workflow: "Pledge", state: "none" } });
  });
  it("throws NOT_FOUND for an unknown name", async () => {
    await expect(optimizeLayoutTool({ name: "Nope" }, ctx({ "Pledge.json": PLEDGE }))).rejects.toMatchObject({ isError: true });
  });
});
