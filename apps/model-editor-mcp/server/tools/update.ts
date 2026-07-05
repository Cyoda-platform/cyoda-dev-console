import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { updateWorkflowInput } from "../schemas.js";
import { findByName } from "../discovery.js";
import { jsonDiff } from "../diff.js";

/** `update_workflow(name, content)` — validated whole-document write; on any
 *  parse/validation error writes NOTHING and returns diagnostics. */
export async function updateWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = updateWorkflowInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name, content } = input.data;

  try { JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }

  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

  const before = await ctx.read(entry.relativePath);
  // `parseImportPayload` already runs `validateSemantics` into `parsed.issues`
  // (identical to a follow-up `ctx.validate(parsed.document)` call), so source
  // every diagnostic from `parsed.issues` alone — never re-concatenate, or each
  // one is emitted twice.
  const parsed = ctx.parseImport(content);
  if (!parsed.document || parsed.issues.some((i) => i.severity === "error")) {
    return { content: [{ type: "text", text: `VALIDATION_FAILED: ${JSON.stringify(parsed.issues)}` }], isError: true, structuredContent: { code: "VALIDATION_FAILED", diagnostics: parsed.issues } };
  }

  const canonical = ctx.serializeImport(parsed.document);
  await ctx.write(entry.relativePath, canonical);
  let beforeParsed: unknown = {};
  try { beforeParsed = JSON.parse(before.contents); } catch { /* diff against {} */ }
  const diff = jsonDiff(beforeParsed, JSON.parse(canonical));
  return ok({ name, path: entry.relativePath, ok: true, diff, diagnostics: parsed.issues });
}
