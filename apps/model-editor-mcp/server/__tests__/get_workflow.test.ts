import { describe, it, expect, vi } from "vitest";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";
import { getWorkflowTool } from "../tools/get_workflow.js";

/**
 * Legacy/raw fixture with THREE things `parseImport -> serializeImport` canonicalization (used by
 * `show_workflow`/`update_workflow`) would change: (1) `operatorType` instead of `operation` on
 * the criterion — canonicalization renames/deletes it; (2) no `disabled` key on the transition —
 * canonicalization injects `disabled:false`; (3) an empty-string `context` on the criterion's
 * function config — canonicalization drops it. `get_workflow` must preserve all three verbatim
 * since it never calls parseImport/serializeImport.
 */
const RAW = JSON.stringify({
  importMode: "MERGE",
  workflows: [{
    version: "1.3", name: "Pledge", initialState: "none", active: true,
    states: {
      none: {
        transitions: [{
          name: "create", next: "created", manual: false,
          criterion: { type: "simple", jsonPath: "$.amount", operatorType: "GREATER_THAN", value: 0 },
        }],
      },
      created: { transitions: [] },
    },
  }],
});

function entry(over: Partial<WorkflowFileIndexEntry> = {}): WorkflowFileIndexEntry {
  return { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1, ...over };
}

/** A ToolContext backed by an in-memory file map. `parseImport`/`serializeImport` are stubbed to
 *  THROW if called at all — `get_workflow` must never touch them (that's exactly the
 *  canonicalization pathway this raw read exists to avoid). */
function ctx(files: Record<string, string>, over: Partial<ToolContext> = {}): ToolContext {
  return {
    root: "/r",
    workflowGlobs: ["**/*.json"],
    entityGlobs: [],
    connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => {
      const c = files[rel];
      if (c === undefined) throw new Error(`not found: ${rel}`);
      return { contents: c, lastModified: "t", sizeBytes: c.length };
    }),
    write: vi.fn(async () => { throw new Error("get_workflow must never write"); }),
    deleteFile: vi.fn(async () => { throw new Error("get_workflow must never delete"); }),
    discover: vi.fn(async () => [entry()]),
    discoverEntities: vi.fn(async () => []),
    setGlobs: vi.fn(),
    parseImport: vi.fn(() => { throw new Error("get_workflow must NOT call parseImport"); }) as unknown as ToolContext["parseImport"],
    serializeImport: vi.fn(() => { throw new Error("get_workflow must NOT call serializeImport"); }) as unknown as ToolContext["serializeImport"],
    validate: vi.fn() as unknown as ToolContext["validate"],
    ...over,
  };
}

describe("getWorkflowTool", () => {
  it("returns the raw on-disk contents byte-faithfully, preserving fields canonicalization would change", async () => {
    const r = await getWorkflowTool({ name: "Pledge" }, ctx({ "Pledge.json": RAW }));
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0]!.text);
    expect(out).toEqual({ name: "Pledge", path: "Pledge.json", content: RAW, lastModified: "t" });

    // Load-bearing assertion: parse the returned `content` back and confirm the legacy field
    // survived verbatim — proving no parseImport/serializeImport canonicalization ran.
    const roundTripped = JSON.parse(out.content) as {
      workflows: [{ states: { none: { transitions: [{ criterion: { operatorType?: string; operation?: string }; disabled?: boolean }] } } }];
    };
    const transition = roundTripped.workflows[0].states.none.transitions[0];
    expect(transition.criterion.operatorType).toBe("GREATER_THAN"); // preserved, not renamed
    expect(transition.criterion.operation).toBeUndefined(); // canonicalization would set this instead
    expect(transition.disabled).toBeUndefined(); // canonicalization would inject `disabled: false`
  });

  it("throws NOT_FOUND for an absent workflow name", async () => {
    await expect(getWorkflowTool({ name: "Nope" }, ctx({ "Pledge.json": RAW }))).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
  });

  it("rejects unknown args", async () => {
    await expect(getWorkflowTool({ name: "Pledge", bogus: 1 }, ctx({ "Pledge.json": RAW }))).rejects.toMatchObject({ isError: true });
  });
});
