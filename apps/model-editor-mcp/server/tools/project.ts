import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { getProjectInput, configureProjectInput } from "../schemas.js";

/**
 * `get_project()` — root, current globs, and workflow/entity counts.
 * `counts.workflows`/`counts.entities` come straight from `ctx.discover()`/
 * `ctx.discoverEntities()` — the SAME enumeration `list_workflows`/
 * `list_entities` use — so the two can never drift (the parked branch's
 * whole-branch review flagged exactly this drift risk when the old code
 * re-implemented a second, narrower scan just for the count).
 *
 * Also surfaces `_connection.url` in its OWN shape (not via any blanket
 * wrapper — the dispatcher no longer sprays `_connection` into every tool
 * result, see `connection_info`'s dedicated `{url, port}` tool for the other
 * place the URL is discoverable).
 */
export async function getProjectTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = getProjectInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);

  const [workflows, entities] = await Promise.all([ctx.discover(), ctx.discoverEntities()]);
  return ok({
    root: ctx.root,
    workflowGlobs: ctx.workflowGlobs,
    entityGlobs: ctx.entityGlobs,
    counts: { workflows: workflows.length, entities: entities.length },
    _connection: { url: ctx.connectionUrl },
  });
}

/**
 * `configure_project({ name?, workflowGlobs?, entityGlobs? })` — updates the
 * session's mutable globs via `ctx.setGlobs` (only supplied fields change);
 * NEVER persisted to disk (session-only, matching the parked branch's D3/§3.6
 * invariant — this headless server has no `config.json` to accidentally
 * corrupt, but the rule is the same: an agent's project locations must not
 * outlive its session). `name` is parsed but not applied anywhere — see the
 * schema's doc comment in `schemas.ts`.
 */
export async function configureProjectTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = configureProjectInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const patch = input.data;

  ctx.setGlobs({
    ...(patch.workflowGlobs !== undefined ? { workflowGlobs: patch.workflowGlobs } : {}),
    ...(patch.entityGlobs !== undefined ? { entityGlobs: patch.entityGlobs } : {}),
  });

  return ok({ root: ctx.root, workflowGlobs: ctx.workflowGlobs, entityGlobs: ctx.entityGlobs });
}
