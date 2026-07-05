import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { classifyWorkflowFile, WORKFLOW_STATUSES } from "@cyoda/workflow-file-indexer";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { matchGlob } from "./glob.js";
import { readConfined } from "./files.js";

/** Directory names never scanned/watched — shared with `watch.ts` so a live edit inside
 *  one of these can never trigger a push for a file `discoverWorkflows` would never surface. */
export const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "target", ".model-editor"]);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXCLUDED_DIRS.has(e.name)) yield* walk(abs);
    } else if (e.isFile()) {
      yield abs;
    }
  }
}

/** Enumerate the project with `node:fs`, scope by `workflowGlobs`, classify with the
 *  file-indexer, and keep only workflow-status files (sidecars excluded). */
export async function discoverWorkflows(root: string, workflowGlobs: string[]): Promise<WorkflowFileIndexEntry[]> {
  const out: WorkflowFileIndexEntry[] = [];
  for await (const abs of walk(root)) {
    const rel = relative(root, abs).split(sep).join("/");
    if (!rel.endsWith(".json") || rel.endsWith(".layout.json")) continue;
    if (workflowGlobs.length > 0 && !workflowGlobs.some((g) => matchGlob(rel, g))) continue;
    const { contents, lastModified, sizeBytes } = await readConfined(root, rel);
    const entry = classifyWorkflowFile({ path: abs, relativePath: rel, contents, lastModified, sizeBytes });
    if (WORKFLOW_STATUSES.includes(entry.status)) out.push(entry);
  }
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

/**
 * Resolve a workflow by declared name first, then by file basename (`Foo.json` → `Foo`).
 * Generic over the minimal `{ relativePath, workflows }` shape it actually reads so both the
 * tools (which pass full `WorkflowFileIndexEntry[]`) and `http.ts`'s `POST /layout` allowlist
 * (which passes the narrower `discover` result) share ONE name-resolution rule — no drift.
 */
export function findByName<T extends { relativePath: string; workflows: { name: string }[] }>(
  entries: T[],
  name: string,
): T | undefined {
  return (
    entries.find((e) => e.workflows.some((w) => w.name === name)) ??
    entries.find((e) => e.relativePath.replace(/\.json$/, "").split("/").pop() === name)
  );
}
