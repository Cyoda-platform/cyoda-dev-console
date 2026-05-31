export type WorkflowFileStatus =
  | "valid-workflow"
  | "invalid-workflow"
  | "json-not-workflow"
  | "parse-error";

export interface WorkflowFileIndexEntry {
  path: string;
  relativePath: string;
  status: WorkflowFileStatus;
  workflows: Array<{ name: string; version?: string; entity?: string }>;
  lastModified: string;
  sizeBytes: number;
  error?: string;
}
