import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

export function deriveDisplayName(entry: WorkflowFileIndexEntry): string {
  if (entry.workflows.length > 0) {
    const name = entry.workflows[0]?.name;
    if (name) return name.replace(/_workflow$/i, "");
  }
  const base = entry.relativePath.split("/").pop() ?? entry.relativePath;
  return base.replace(/\.json$/, "").replace(/_workflow$/i, "");
}
