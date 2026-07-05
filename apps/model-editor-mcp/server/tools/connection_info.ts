import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { connectionInfoInput } from "../schemas.js";

/** `connection_info()` — surface the browser URL/port (never printed to stdout). */
export async function connectionInfoTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = connectionInfoInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const url = new URL(ctx.connectionUrl);
  return ok({ url: ctx.connectionUrl, port: Number(url.port) });
}
