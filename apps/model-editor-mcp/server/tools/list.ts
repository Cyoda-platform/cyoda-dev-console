import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { listWorkflowsInput } from "../schemas.js";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";

/** `list_workflows` → `[{ name, path, states, transitions, valid }]`. */
export async function listWorkflowsTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = listWorkflowsInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);

  const entries = await ctx.discover();
  const out: Array<{ name: string; path: string; states: number; transitions: number; valid: boolean }> = [];
  for (const entry of entries) {
    let states = 0, transitions = 0, valid = false;
    try {
      const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
      if (parsed.document) {
        for (const wf of parsed.document.session.workflows) {
          const codes = Object.keys(wf.states);
          states += codes.length;
          for (const code of codes) transitions += wf.states[code]!.transitions.length;
        }
        valid = ctx.validate(parsed.document).filter((i) => i.severity === "error").length === 0;
      }
    } catch { /* unreadable/unparseable → zero counts, valid:false */ }
    const name = entry.workflows[0]?.name ?? entry.relativePath.replace(/\.json$/, "").split("/").pop()!;
    out.push({ name, path: entry.relativePath, states, transitions, valid });
  }
  return ok(out);
}
