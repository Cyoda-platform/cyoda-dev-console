import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { validateWorkflowInput } from "../schemas.js";
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
