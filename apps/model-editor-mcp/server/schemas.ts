import { z } from "zod";

/** `list_workflows` / `connection_info` — no input. */
export const listWorkflowsInput = z.object({}).strict();
export const connectionInfoInput = z.object({}).strict();

/** `show_workflow` / `validate_workflow` — workflow name (declared name or file basename). */
export const showWorkflowInput = z.object({ name: z.string().min(1) }).strict();
export const validateWorkflowInput = z.object({ name: z.string().min(1) }).strict();

/** `validate_workflows` — batch form of `validate_workflow`, no args (YAGNI on a name filter:
 *  add one later if a caller actually needs to validate a subset). */
export const validateWorkflowsInput = z.object({}).strict();

/** `get_workflow` — name only, mirrors `getEntityInput`. Raw/byte-faithful read: unlike
 *  `showWorkflowInput`'s handler, this one never calls parseImport/serializeImport. */
export const getWorkflowInput = z.object({ name: z.string().min(1) }).strict();

/** `update_workflow` — name + whole-document JSON string (JSON validity is the handler's job). */
export const updateWorkflowInput = z.object({ name: z.string().min(1), content: z.string() }).strict();

/** `create_workflow` — name + a full import-payload JSON string (`{importMode, workflows:[...]}`),
 *  mirroring `updateWorkflowInput`'s shape exactly (JSON validity is the handler's job). */
export const createWorkflowInput = z.object({ name: z.string().min(1), content: z.string() }).strict();

/** `delete_workflow` — name only, mirrors `deleteEntityInput`. */
export const deleteWorkflowInput = z.object({ name: z.string().min(1) }).strict();

/** Real `PinnedNode` from `@cyoda/workflow-layout` — explicit coordinates only. */
const pinnedNode = z.object({ id: z.string(), x: z.number(), y: z.number() }).strict();

/**
 * `optimize_layout` — `options` map 1:1 onto the real `LayoutOptions`
 * (`@cyoda/workflow-layout@0.1.3`): orientation | preset | nodeSize | pinned.
 * There is deliberately NO `direction` and NO `spacing`.
 */
export const optimizeLayoutInput = z
  .object({
    name: z.string().min(1),
    options: z
      .object({
        orientation: z.enum(["vertical", "horizontal"]).optional(),
        preset: z.enum(["websiteCompact", "configuratorReadable", "opsAudit"]).optional(),
        nodeSize: z.object({ width: z.number(), height: z.number() }).strict().optional(),
        pinned: z.array(pinnedNode).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** `POST /layout` body — the human's debounced layout write-back. */
export const layoutPostBody = z
  .object({ name: z.string().min(1), workflowUi: z.record(z.string(), z.unknown()) })
  .strict();

export type ListWorkflowsInput = z.infer<typeof listWorkflowsInput>;
export type ShowWorkflowInput = z.infer<typeof showWorkflowInput>;
export type GetWorkflowInput = z.infer<typeof getWorkflowInput>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowInput>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowInput>;
export type DeleteWorkflowInput = z.infer<typeof deleteWorkflowInput>;
export type OptimizeLayoutInput = z.infer<typeof optimizeLayoutInput>;
export type ValidateWorkflowInput = z.infer<typeof validateWorkflowInput>;
export type ValidateWorkflowsInput = z.infer<typeof validateWorkflowsInput>;
export type LayoutPostBody = z.infer<typeof layoutPostBody>;

/** `list_entities` — no input. */
export const listEntitiesInput = z.object({}).strict();

/** `get_entity` / `delete_entity` — name only (name = file stem, resolved against `entityGlobs`). */
export const getEntityInput = z.object({ name: z.string().min(1) }).strict();
export const deleteEntityInput = z.object({ name: z.string().min(1) }).strict();

/** `show_entity` — entity name; mirrors `showWorkflowInput`/`getEntityInput`. */
export const showEntityInput = z.object({ name: z.string().min(1) }).strict();

/** `create_entity` / `update_entity` — name + whole-document JSON string. */
export const createEntityInput = z.object({ name: z.string().min(1), content: z.string() }).strict();
export const updateEntityInput = z.object({ name: z.string().min(1), content: z.string() }).strict();

export type GetEntityInput = z.infer<typeof getEntityInput>;
export type ShowEntityInput = z.infer<typeof showEntityInput>;
export type CreateEntityInput = z.infer<typeof createEntityInput>;
export type UpdateEntityInput = z.infer<typeof updateEntityInput>;
export type DeleteEntityInput = z.infer<typeof deleteEntityInput>;

/** `get_project` — no input. */
export const getProjectInput = z.object({}).strict();

/**
 * `configure_project` — updates the session's `workflowGlobs`/`entityGlobs`
 * (all fields optional; only supplied fields change) and never persists to
 * disk. `name` is accepted for parity with the parked branch's schema/design
 * text but is currently a no-op: this headless server has no project-"name"
 * concept to store it in, and `get_project`'s own return shape (below) has no
 * `name` field either — it's forward-compatible surface, not a bug.
 */
export const configureProjectInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    workflowGlobs: z.array(z.string()).optional(),
    entityGlobs: z.array(z.string()).optional(),
  })
  .strict();

export type GetProjectInput = z.infer<typeof getProjectInput>;
export type ConfigureProjectInput = z.infer<typeof configureProjectInput>;
