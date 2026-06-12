export type WorkflowFileStatus =
  | "valid-workflow"
  | "invalid-workflow"
  | "export-payload"
  | "probable-workflow"
  | "json-not-workflow"
  | "parse-error";

/** All statuses that indicate the file is (or may be) a workflow — used to split explorer sections. */
export const WORKFLOW_STATUSES: WorkflowFileStatus[] = [
  "valid-workflow",
  "invalid-workflow",
  "export-payload",
  "probable-workflow",
  "parse-error",
];

export interface WorkflowFileIndexEntry {
  path: string;
  relativePath: string;
  status: WorkflowFileStatus;
  workflows: Array<{ name: string; version?: string; entity?: string }>;
  lastModified: string;
  sizeBytes: number;
  error?: string;
}
