import { parseImportPayload } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry, WorkflowFileStatus } from "./types.js";

export interface ClassifyInput {
  path: string;
  relativePath: string;
  contents: string;
  lastModified: string;
  sizeBytes: number;
}

export function classifyWorkflowFile(input: ClassifyInput): WorkflowFileIndexEntry {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.contents);
  } catch (e) {
    return makeEntry(input, "parse-error", [], (e as Error).message);
  }
  if (
    !parsedJson ||
    typeof parsedJson !== "object" ||
    !("workflows" in parsedJson) ||
    !("importMode" in parsedJson)
  ) {
    return makeEntry(input, "json-not-workflow", []);
  }
  const result = parseImportPayload(input.contents);
  if (result.ok && result.value) {
    const workflows = result.value.workflows.map((w) => ({
      name: w.name,
      version: w.version,
      entity: undefined,
    }));
    return makeEntry(input, "valid-workflow", workflows);
  }
  const errMsg =
    result.issues.map((i) => i.message).join("; ") ||
    "parseImportPayload rejected the file";
  return makeEntry(input, "invalid-workflow", [], errMsg);
}

function makeEntry(
  input: ClassifyInput,
  status: WorkflowFileStatus,
  workflows: WorkflowFileIndexEntry["workflows"],
  error?: string,
): WorkflowFileIndexEntry {
  return {
    path: input.path,
    relativePath: input.relativePath,
    status,
    workflows,
    lastModified: input.lastModified,
    sizeBytes: input.sizeBytes,
    ...(error !== undefined ? { error } : {}),
  };
}
