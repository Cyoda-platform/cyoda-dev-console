import {
  parseImportPayload,
  parseExportPayload,
  LATEST_CYODA_VERSION,
  SUPPORTED_CYODA_VERSIONS,
} from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry, WorkflowFileStatus } from "./types.js";

export interface ClassifyInput {
  path: string;
  relativePath: string;
  contents: string;
  lastModified: string;
  sizeBytes: number;
}

/**
 * Classify a discovered file against a project's configured cyoda-go version.
 *
 * The version controls which dialect `parseImportPayload` uses. A file that parses
 * cleanly under a non-latest configured version is "valid-workflow-legacy" (file tree
 * shows a version badge). A file that fails the configured version but parses under a
 * *different* supported version is "incompatible-version" (e.g. a v0.7 file with a
 * scheduled processor opened in a v0.8 project) — the tooltip points at the version
 * that does parse it. Files that fail every supported dialect remain "invalid-workflow".
 */
export function classifyWorkflowFile(
  input: ClassifyInput,
  cyodaGoVersion: string = LATEST_CYODA_VERSION,
): WorkflowFileIndexEntry {
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
      result = parseImportPayload(input.contents, undefined, { sourceVersion: cyodaGoVersion });
    } catch (e) {
      return makeEntry(input, "parse-error", [], (e as Error).message);
    }
    if (result.ok && result.value) {
      const workflows = result.value.workflows.map((w) => ({
        name: w.name,
        version: w.version,
      }));
      // Parsed cleanly, but under a dialect older than the latest this build ships.
      if (cyodaGoVersion !== LATEST_CYODA_VERSION) {
        return makeEntry(input, "valid-workflow-legacy", workflows, undefined, cyodaGoVersion);
      }
      return makeEntry(input, "valid-workflow", workflows);
    }
    // Failed the configured version. If another supported dialect parses it, this is a
    // version mismatch rather than a malformed workflow.
    const compatibleVersion = SUPPORTED_CYODA_VERSIONS.find(
      (v) => v !== cyodaGoVersion && parsesUnder(input.contents, v),
    );
    if (compatibleVersion !== undefined) {
      return makeEntry(
        input,
        "incompatible-version",
        [],
        `This workflow parses as cyoda-go v${compatibleVersion} but the project targets v${cyodaGoVersion}.`,
        compatibleVersion,
      );
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

/** True when `parseImportPayload` succeeds for the given dialect (errors/throws → false). */
function parsesUnder(contents: string, version: string): boolean {
  try {
    const r = parseImportPayload(contents, undefined, { sourceVersion: version });
    return r.ok && !!r.value;
  } catch {
    return false;
  }
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
  cyodaVersion?: string,
): WorkflowFileIndexEntry {
  return {
    path: input.path,
    relativePath: input.relativePath,
    status,
    workflows,
    lastModified: input.lastModified,
    sizeBytes: input.sizeBytes,
    ...(error !== undefined ? { error } : {}),
    ...(cyodaVersion !== undefined ? { cyodaVersion } : {}),
  };
}
