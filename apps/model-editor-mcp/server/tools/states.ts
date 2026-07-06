import { ok, err, validationFailed } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import type { State } from "@cyoda/workflow-core";
import { addStateInput, removeStateInput, renameStateInput } from "../schemas.js";
import { loadWorkflowForEdit, commitEditedWorkflow, cascadeStateRename, hasLifecycleStateRef } from "./edit_common.js";
import { renameSidecarStateNode, removeSidecarStateNode } from "../layout.js";

/** `add_state` — add a new state (optionally seeded); ALREADY_EXISTS on a duplicate code. */
export async function addStateTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = addStateInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, code, state } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  if (code in loaded.workflow.states) throw err("ALREADY_EXISTS", `state "${code}" already exists in workflow "${workflow}"`);
  loaded.workflow.states[code] = (state ?? { transitions: [] }) as unknown as State;

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  return ok({ workflow, code, path, ok: true, diff, diagnostics });
}

/** `remove_state` — delete a state. Semantic gate catches dangling next/initialState;
 *  an explicit scan catches lifecycle state-criteria the validator ignores (C1). */
export async function removeStateTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = removeStateInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, code } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  if (!(code in loaded.workflow.states)) throw err("NOT_FOUND", `no state "${code}" in workflow "${workflow}"`);
  if (hasLifecycleStateRef(loaded.workflow, code)) {
    throw validationFailed([{ severity: "error", code: "state-referenced-by-lifecycle-criterion",
      message: `state "${code}" is referenced by a lifecycle criterion (field:"state"); repoint it before removing` }]);
  }
  delete loaded.workflow.states[code];

  const { path, diff } = await commitEditedWorkflow(ctx, loaded);
  await removeSidecarStateNode(ctx, loaded.entry.relativePath, loaded.workflow.name, code);
  return ok({ workflow, code, path, ok: true, diff });
}

/** `rename_state` — atomic auto-cascade + sidecar node migration. */
export async function renameStateTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = renameStateInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, oldCode, newCode } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  if (!(oldCode in loaded.workflow.states)) throw err("NOT_FOUND", `no state "${oldCode}" in workflow "${workflow}"`);
  if (newCode in loaded.workflow.states) throw err("ALREADY_EXISTS", `state "${newCode}" already exists in workflow "${workflow}"`);
  cascadeStateRename(loaded.workflow, oldCode, newCode);

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  await renameSidecarStateNode(ctx, loaded.entry.relativePath, loaded.workflow.name, oldCode, newCode);
  return ok({ workflow, oldCode, newCode, path, ok: true, diff, diagnostics });
}
