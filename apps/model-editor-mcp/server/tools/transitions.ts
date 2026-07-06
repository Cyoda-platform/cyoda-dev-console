import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import type { Transition, ValidationIssue } from "@cyoda/workflow-core";
import { updateTransitionInput, addTransitionInput, removeTransitionInput } from "../schemas.js";
import { loadWorkflowForEdit, commitEditedWorkflow, hasPreviousTransitionRef } from "./edit_common.js";

/**
 * `update_transition(workflow, state, name, patch)` — shallow field-merge onto the addressed
 * transition: `{...existing, ...patch}`. Nested fields (criterion/processors/schedule/
 * annotations) replace wholesale rather than deep-merging — the shared §5 re-parse gate
 * (`commitEditedWorkflow`) is what actually validates the merged shape, so a malformed
 * `patch.criterion` surfaces as VALIDATION_FAILED rather than being silently accepted or
 * dropped (closes C2). `patch.name` renames the transition; if the rename leaves a lifecycle
 * `previousTransition` criterion still pointing at the OLD name, a non-blocking `warning`
 * diagnostic is appended (rename does not cascade the reference automatically).
 */
export async function updateTransitionTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = updateTransitionInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, state, name, patch } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  const st = loaded.workflow.states[state];
  if (!st) throw err("NOT_FOUND", `no state "${state}" in workflow "${workflow}"`);
  const idx = st.transitions.findIndex((t) => t.name === name);
  if (idx === -1) throw err("NOT_FOUND", `no transition "${name}" on state "${state}"`);

  st.transitions[idx] = { ...st.transitions[idx], ...patch } as unknown as Transition; // re-parse gate validates the merge
  const resultName = st.transitions[idx]!.name;

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  const out: ValidationIssue[] = [...diagnostics];
  if (patch.name && patch.name !== name && hasPreviousTransitionRef(loaded.workflow, name)) {
    out.push({
      severity: "warning",
      code: "previous-transition-ref-not-cascaded",
      message: `renamed transition "${name}"→"${patch.name}" is still referenced by a lifecycle previousTransition criterion pointing at "${name}"; review with update_workflow`,
    });
  }
  return ok({ workflow, state, name: resultName, path, ok: true, diff, diagnostics: out });
}

/**
 * `add_transition(workflow, state, transition)` — append a new transition to `state`.
 * `transition` requires name + next + manual (schema-enforced: missing `manual` is
 * INVALID_ARGS, not a silent default). Rejects a duplicate `name` within the same state as
 * ALREADY_EXISTS, checked BEFORE any mutation. A dangling `next` (referencing a nonexistent
 * state) is caught by the shared re-parse gate as VALIDATION_FAILED.
 */
export async function addTransitionTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = addTransitionInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, state, transition } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  const st = loaded.workflow.states[state];
  if (!st) throw err("NOT_FOUND", `no state "${state}" in workflow "${workflow}"`);
  if (st.transitions.some((t) => t.name === transition.name)) throw err("ALREADY_EXISTS", `transition "${transition.name}" already exists on state "${state}"`);
  st.transitions.push(transition as unknown as Transition);

  const { path, diff, diagnostics } = await commitEditedWorkflow(ctx, loaded);
  return ok({ workflow, state, name: transition.name, path, ok: true, diff, diagnostics });
}

/**
 * `remove_transition(workflow, state, name)` — delete the addressed transition. NOT_FOUND if
 * it doesn't exist (checked before any mutation, so a miss writes nothing).
 */
export async function removeTransitionTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = removeTransitionInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { workflow, state, name } = input.data;

  const loaded = await loadWorkflowForEdit(ctx, workflow);
  const st = loaded.workflow.states[state];
  if (!st) throw err("NOT_FOUND", `no state "${state}" in workflow "${workflow}"`);
  const idx = st.transitions.findIndex((t) => t.name === name);
  if (idx === -1) throw err("NOT_FOUND", `no transition "${name}" on state "${state}"`);
  st.transitions.splice(idx, 1);

  const { path, diff } = await commitEditedWorkflow(ctx, loaded);
  return ok({ workflow, state, name, path, ok: true, diff });
}
