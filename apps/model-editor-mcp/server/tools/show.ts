import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { showWorkflowInput } from "../schemas.js";
import { findByName } from "../discovery.js";
import { loadRemappedLayout } from "../layout.js";

export interface ShownPayload { workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }

/** `show_workflow(name)` — parse + canonicalise, push a "show" (content + remapped
 *  layout) via `setShown`, and return the document to Claude. */
export async function showWorkflowTool(args: unknown, ctx: ToolContext, setShown: (p: ShownPayload) => void): Promise<McpResult> {
  const input = showWorkflowInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;

  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

  const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
  if (!parsed.document) throw err("PARSE_ERROR", `"${entry.relativePath}" is not a parseable workflow`);

  const content = ctx.serializeImport(parsed.document);
  const layout = await loadRemappedLayout(ctx, entry.relativePath, parsed.document.meta.ids.transitions);
  const revision = Date.now();
  setShown({ workflow: name, revision, content, layout });
  return ok({ name, path: entry.relativePath, content, layout, diagnostics: parsed.issues });
}
