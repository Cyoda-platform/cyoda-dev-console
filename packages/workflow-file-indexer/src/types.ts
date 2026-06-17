export type WorkflowFileStatus =
  | "valid-workflow"
  | "valid-workflow-legacy"
  | "invalid-workflow"
  | "incompatible-version"
  | "export-payload"
  | "probable-workflow"
  | "json-not-workflow"
  | "parse-error";

/** All statuses that indicate the file is (or may be) a workflow — used to split explorer sections. */
export const WORKFLOW_STATUSES: WorkflowFileStatus[] = [
  "valid-workflow",
  "valid-workflow-legacy",
  "invalid-workflow",
  "incompatible-version",
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
  /**
   * The cyoda-go dialect this file was parsed under. Set for "valid-workflow-legacy"
   * (the project's non-latest configured version) and, for "incompatible-version",
   * the other supported version that *can* parse it. Drives the file-tree badge/tooltip.
   */
  cyodaVersion?: string;
}
