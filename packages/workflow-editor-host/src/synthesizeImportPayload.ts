/**
 * Cyoda workflow files on disk aren't always shaped as an import payload
 * (`{ importMode, workflows: [...] }`). They may instead be:
 * - a bare `{ workflows: [...] }` (no importMode), or
 * - a standalone workflow object (block-portal format:
 *   `{ version, name, initialState, states, ... }`).
 *
 * `parseImportPayload` only accepts the import-payload shape, so callers must
 * synthesize `importMode` before parsing. Leaves `contents` unchanged if it
 * isn't valid JSON, isn't an object, or already has `importMode`.
 */
export function synthesizeImportPayload(contents: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return contents;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return contents;
  }
  const obj = parsed as Record<string, unknown>;
  if ("importMode" in obj) {
    return contents;
  }
  if ("workflows" in obj) {
    return JSON.stringify({ importMode: "MERGE", ...obj }, null, 2);
  }
  return JSON.stringify({ importMode: "MERGE", workflows: [obj] }, null, 2);
}
