import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { listWorkflowsInput } from "../schemas.js";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";

/** `list_workflows` → `{ workflows: [{ name, path, states, transitions, valid, reason? }] }`.
 *  `reason` is present ONLY when `valid` is `false` — the first error-severity diagnostic's
 *  message (or a short fixed string for the unreadable/unparseable case) — so a caller can learn
 *  WHY a workflow is invalid without a separate `validate_workflow` round-trip. Wrapped in an
 *  object (not a bare array) for `structuredContent` shape consistency with the other list tools
 *  (`list_entities`). */
export async function listWorkflowsTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = listWorkflowsInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);

  const entries = await ctx.discover();
  const out: Array<{ name: string; path: string; states: number; transitions: number; valid: boolean; reason?: string }> = [];
  for (const entry of entries) {
    let states = 0, transitions = 0, valid = false;
    let reason: string | undefined;
    try {
      const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
      if (parsed.document) {
        for (const wf of parsed.document.session.workflows) {
          const codes = Object.keys(wf.states);
          states += codes.length;
          for (const code of codes) transitions += wf.states[code]!.transitions.length;
        }
        const errors = ctx.validate(parsed.document).filter((i) => i.severity === "error");
        valid = errors.length === 0;
        if (!valid) reason = errors[0]!.message;
      } else {
        reason = "could not parse workflow";
      }
    } catch {
      reason = "could not parse workflow"; // unreadable/unparseable → zero counts, valid:false
    }
    const name = entry.workflows[0]?.name ?? entry.relativePath.replace(/\.json$/, "").split("/").pop()!;
    // `exactOptionalPropertyTypes` forbids `reason: undefined` — spread it in only when present.
    out.push({ name, path: entry.relativePath, states, transitions, valid, ...(reason !== undefined ? { reason } : {}) });
  }
  return ok({ workflows: out });
}
