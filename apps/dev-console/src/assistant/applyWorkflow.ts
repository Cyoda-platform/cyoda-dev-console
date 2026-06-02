import { parseImportPayload, serializeImportPayload } from "@cyoda/workflow-core";

export type ApplyResult =
  | { ok: true; canonical: string }
  | { ok: false; issues: string[] };

/**
 * Validate a model-proposed workflow JSON and return the canonical serialization. Enforces
 * the CLAUDE.md invariant: the applied file is always produced by `serializeImportPayload`,
 * so a malformed or over-reaching proposal cannot write non-canonical / non-workflow JSON.
 */
export function validateAndCanonicalize(json: string): ApplyResult {
  let result;
  try {
    // parseImportPayload throws (ParseJsonError) on malformed JSON, and returns
    // { ok:false, issues } on schema/semantic failures — handle both.
    result = parseImportPayload(json);
  } catch (e) {
    return { ok: false, issues: [(e as Error).message ?? "Invalid JSON"] };
  }
  if (!result.ok || !result.document) {
    const issues = result.issues?.length
      ? result.issues.map((i) => i.message)
      : ["Could not parse the proposed workflow JSON."];
    return { ok: false, issues };
  }
  return { ok: true, canonical: serializeImportPayload(result.document) };
}
