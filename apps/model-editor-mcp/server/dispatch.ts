import { err, isMcpResult } from "./envelope.js";
import type { McpResult, ToolHandler } from "./envelope.js";

/** `(name, args) => McpResult`, resolved from a tool-name -> handler map. */
export type Dispatch = (name: string, args: unknown) => Promise<McpResult>;

/**
 * Build a dispatcher from a tool-name -> handler map.
 *
 * - An unregistered tool name resolves to an `UNKNOWN_TOOL` error envelope.
 * - A handler that throws is caught: a thrown `err(...)` envelope is
 *   forwarded unchanged, any other thrown value (an `Error` or otherwise) is
 *   normalized into an `INTERNAL_ERROR` envelope.
 *
 * This ensures a single bad tool call can never crash the request-handling
 * loop.
 */
export function makeDispatcher(map: Record<string, ToolHandler>): Dispatch {
  return async (name, args) => {
    const handler = map[name];
    if (!handler) {
      return err("UNKNOWN_TOOL", `no tool registered for "${name}"`);
    }
    try {
      return await handler(args);
    } catch (thrown) {
      if (isMcpResult(thrown)) {
        return thrown;
      }
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      return err("INTERNAL_ERROR", message);
    }
  };
}
