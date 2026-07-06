import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import type { ValidationIssue } from "@cyoda/workflow-core";
import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { validateWorkflowInput, validateWorkflowsInput } from "../schemas.js";
import { findByName } from "../discovery.js";

/** `validate_workflow(name)` — parse + `validateAll`, read-only. */
export async function validateWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = validateWorkflowInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;

  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

  // `parseImportPayload` already runs `validateSemantics` into `parsed.issues`;
  // a follow-up `ctx.validate(parsed.document)` would return the identical set,
  // so use `parsed.issues` alone rather than concatenating (which double-emits).
  const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
  const diagnostics = parsed.issues;
  const valid = !!parsed.document && diagnostics.filter((i) => i.severity === "error").length === 0;
  return ok({ name, valid, diagnostics });
}

/**
 * `validate_workflows()` — batch form of {@link validateWorkflowTool}: validates EVERY discovered
 * workflow in one call, returning `{ workflows: [{ name, valid, diagnostics }] }` (same per-item
 * shape as `validate_workflow`, wrapped in an object for `structuredContent` shape consistency
 * with the other list tools). Mirrors the single-item logic exactly (parse -> `parsed.issues` ->
 * valid). Each workflow's parse is wrapped in its own try/catch so ONE unreadable/unparseable file
 * yields `{ name, valid:false, diagnostics:[] }` rather than failing the whole batch.
 */
export async function validateWorkflowsTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = validateWorkflowsInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);

  const entries = await ctx.discover();
  const out: Array<{ name: string; valid: boolean; diagnostics: ValidationIssue[] }> = [];
  for (const entry of entries) {
    const name = entry.workflows[0]?.name ?? entry.relativePath.replace(/\.json$/, "").split("/").pop()!;
    try {
      const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
      const diagnostics = parsed.issues;
      const valid = !!parsed.document && diagnostics.filter((i) => i.severity === "error").length === 0;
      out.push({ name, valid, diagnostics });
    } catch {
      out.push({ name, valid: false, diagnostics: [] }); // unreadable/unparseable — don't fail the batch
    }
  }
  return ok({ workflows: out });
}
