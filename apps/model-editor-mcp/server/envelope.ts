import type { McpResult } from "@cyoda/agent-bridge-contract";

export type { McpResult };

/** A tool handler: takes the raw `tools/call` args, returns an MCP result envelope. */
export type ToolHandler = (args: unknown) => Promise<McpResult>;

/** Wrap a successful tool result as text content plus the raw structured data. */
export function ok(data: unknown): McpResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

/**
 * Build an error envelope. Valid both as a return value (`return err(...)`)
 * and as a thrown value (`throw err(...)`) — {@link makeDispatcher} recognizes
 * the envelope shape in a `catch` and forwards it unchanged either way.
 */
export function err(code: string, message: string): McpResult {
  return {
    content: [{ type: "text", text: `${code}: ${message}` }],
    isError: true,
  };
}

/** True if `value` is already a well-formed MCP result envelope. */
export function isMcpResult(value: unknown): value is McpResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
  );
}
