import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { showEntityInput } from "../schemas.js";
import { findEntityByName } from "../discovery.js";

export interface ShownEntityPayload { entity: string; contents: string }

/** `show_entity(name)` — the Claude-driven equivalent of the human picking an entity in the
 *  sidebar: resolve by name via discovery, read the RAW on-disk JSON (no parse/serialize/layout —
 *  entities are plain JSON, unlike workflows), push a "showEntity" over SSE via `setShownEntity`,
 *  and return the document to Claude. READ-only: the browser never writes entity content back. */
export async function showEntityTool(args: unknown, ctx: ToolContext, setShownEntity: (p: ShownEntityPayload) => void): Promise<McpResult> {
  const input = showEntityInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name } = input.data;

  const entry = findEntityByName(await ctx.discoverEntities(), name);
  if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);

  const { contents, lastModified } = await ctx.read(entry.relativePath);
  setShownEntity({ entity: name, contents });
  return ok({ name, path: entry.relativePath, contents, lastModified });
}
