import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";

/** In-memory ToolContext with REAL workflow-core parse/serialize/validate, so
 *  validation-path tests (C1/C2) exercise the real library, not a mock. */
export function makeEditCtx(files: Record<string, string>): ToolContext {
  const store: Record<string, string> = { ...files };
  return {
    root: "/proj",
    workflowGlobs: ["**/*.json"],
    entityGlobs: [],
    connectionUrl: "http://127.0.0.1:0",
    read: async (rel) => {
      if (!(rel in store)) throw new Error(`ENOENT: ${rel}`);
      return { contents: store[rel]!, lastModified: "t", sizeBytes: store[rel]!.length };
    },
    write: async (rel, contents) => { store[rel] = contents; return { path: rel, lastModified: "t", sizeBytes: contents.length }; },
    deleteFile: async (rel) => { delete store[rel]; },
    discover: async () =>
      Object.keys(store)
        .filter((r) => r.endsWith(".json") && !r.endsWith(".layout.json"))
        .map((rel) => {
          let workflows: { name: string }[] = [];
          try {
            const p = parseImportPayload(synthesizeImportPayload(store[rel]!));
            workflows = (p.document?.session.workflows ?? []).map((w) => ({ name: w.name }));
          } catch { /* unparseable → no names, still discoverable by basename */ }
          return { relativePath: rel, path: `/proj/${rel}`, workflows, status: "workflow", contents: store[rel]!, lastModified: "t", sizeBytes: 0 } as unknown as WorkflowFileIndexEntry;
        }),
    discoverEntities: async () => [],
    setGlobs: () => {},
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
  };
}

/** A minimal valid single-workflow import payload: states draft→review→done,
 *  one transition carries a lifecycle state-criterion (for C1 tests). */
export const WF_FIXTURE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.3", name: "Order", initialState: "draft", active: true,
      states: {
        draft: { transitions: [{ name: "submit", next: "review", manual: false, disabled: false }] },
        review: { transitions: [{ name: "approve", next: "done", manual: true, disabled: false,
          criterion: { type: "lifecycle", field: "state", operation: "EQUALS", value: "draft" } }] },
        done: { transitions: [] },
      },
    },
  ],
});
