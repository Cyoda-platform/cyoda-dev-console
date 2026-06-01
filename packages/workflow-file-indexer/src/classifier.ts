import { parseImportPayload, parseExportPayload } from "@cyoda/workflow-core";
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

  if (!isObj(parsedJson)) {
    return makeEntry(input, "json-not-workflow", []);
  }

  // Case 1: Import payload — has both importMode and workflows
  if ("importMode" in parsedJson && "workflows" in parsedJson) {
    let result;
    try {
      result = parseImportPayload(input.contents);
    } catch (e) {
      return makeEntry(input, "parse-error", [], (e as Error).message);
    }
    if (result.ok && result.value) {
      const workflows = result.value.workflows.map((w) => ({
        name: w.name,
        version: w.version,
      }));
      return makeEntry(input, "valid-workflow", workflows);
    }
    const errMsg =
      result.issues.map((i) => i.message).join("; ") ||
      "parseImportPayload rejected the file";
    return makeEntry(input, "invalid-workflow", [], errMsg);
  }

  // Case 2: Export payload — has entityName + modelVersion + workflows
  if ("entityName" in parsedJson && "modelVersion" in parsedJson && "workflows" in parsedJson) {
    let result;
    try {
      result = parseExportPayload(input.contents);
    } catch (e) {
      return makeEntry(input, "parse-error", [], (e as Error).message);
    }
    if (result.ok && result.value) {
      const entityName = result.value.entityName;
      const workflows = result.value.workflows.map((w) => ({
        name: w.name,
        version: w.version,
        entity: entityName,
      }));
      return makeEntry(input, "export-payload", workflows);
    }
    const errMsg =
      result.issues.map((i) => i.message).join("; ") ||
      "parseExportPayload rejected the file";
    return makeEntry(input, "invalid-workflow", [], errMsg);
  }

  // Case 3: Probable workflow — bare { workflows: [...] } build-skill format
  if ("workflows" in parsedJson) {
    const wfs = parsedJson["workflows"];
    if (Array.isArray(wfs) && wfs.length > 0 && wfs.every(isWorkflowShaped)) {
      const workflows = wfs.filter(isObj).map((w) => {
        const name = typeof w["name"] === "string" ? w["name"] : "unknown";
        const ver = typeof w["version"] === "string" ? w["version"] : undefined;
        return { name, ...(ver !== undefined ? { version: ver } : {}) };
      });
      return makeEntry(input, "probable-workflow", workflows);
    }
  }

  // Case 4: Standalone workflow definition — the file itself is a single workflow object
  // (e.g. Cyoda block-portal format: { version, name, initialState, states, ... })
  if (isWorkflowShaped(parsedJson)) {
    return makeEntry(input, "probable-workflow", [
      {
        name: typeof parsedJson["name"] === "string" ? parsedJson["name"] : "unknown",
        ...(typeof parsedJson["version"] === "string"
          ? { version: parsedJson["version"] }
          : {}),
      },
    ]);
  }

  return makeEntry(input, "json-not-workflow", []);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isWorkflowShaped(v: unknown): boolean {
  if (!isObj(v)) return false;
  return typeof v["name"] === "string" && "initialState" in v && isObj(v["states"]);
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
