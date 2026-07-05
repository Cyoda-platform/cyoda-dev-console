import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { listEntitiesInput, getEntityInput, createEntityInput, updateEntityInput, deleteEntityInput } from "../schemas.js";
import { findEntityByName, resolveEntityCreatePath } from "../discovery.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `list_entities()` → `{ entities: [{ name, path }] }`. */
export async function listEntitiesTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = listEntitiesInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const entries = await ctx.discoverEntities();
  return ok({ entities: entries.map((e) => ({ name: e.name, path: e.relativePath })) });
}

/** `get_entity(name)` — read a single entity's raw JSON contents. */
export async function getEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = getEntityInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;
  const entry = findEntityByName(await ctx.discoverEntities(), name);
  if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);
  const { contents, lastModified } = await ctx.read(entry.relativePath);
  return ok({ name, path: entry.relativePath, contents, lastModified });
}

/** `create_entity(name, content)` — write a NEW entity file. Rejects invalid/non-object
 *  JSON (`INVALID_JSON`) or an already-existing name (`ALREADY_EXISTS`); writes nothing
 *  on either rejection. The destination path is derived from `entityGlobs` — see
 *  `resolveEntityCreatePath`. Existence is checked TWO ways before writing: by declared
 *  name via `findEntityByName` (catches a same-named entity resolved at a different path),
 *  and by probing the resolved target path directly via `ctx.read` (catches a file sitting
 *  at that exact path that `discoverEntities` doesn't surface as an entity — e.g. a JSON
 *  array or other non-object JSON, which discovery silently skips but is very much on disk). */
export async function createEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = createEntityInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name, content } = input.data;

  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }
  if (!isPlainObject(parsed)) throw err("INVALID_JSON", `content for "${name}" must be a JSON object`);

  const discovered = await ctx.discoverEntities();
  const existing = findEntityByName(discovered, name);
  if (existing) throw err("ALREADY_EXISTS", `an entity named "${name}" already exists at "${existing.relativePath}"`);

  // Reuse `discovered` (already fetched for the existence check above) rather than discovering
  // again — it's also what tells the resolver where the existing entities actually live.
  const path = resolveEntityCreatePath(ctx.entityGlobs, name, discovered);

  let occupied = true;
  try { await ctx.read(path); } catch { occupied = false; }
  if (occupied) throw err("ALREADY_EXISTS", `a file already exists at "${path}"`);

  await ctx.write(path, content);
  return ok({ ok: true, name, path });
}

/** `update_entity(name, content)` — overwrite an EXISTING entity's whole-document contents. */
export async function updateEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = updateEntityInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name, content } = input.data;

  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }
  if (!isPlainObject(parsed)) throw err("INVALID_JSON", `content for "${name}" must be a JSON object`);

  const entry = findEntityByName(await ctx.discoverEntities(), name);
  if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);

  await ctx.write(entry.relativePath, content);
  return ok({ ok: true, name, path: entry.relativePath });
}

/** `delete_entity(name)` — delete an existing entity file. */
export async function deleteEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = deleteEntityInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;

  const entry = findEntityByName(await ctx.discoverEntities(), name);
  if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);

  await ctx.deleteFile(entry.relativePath);
  return ok({ ok: true, name });
}
