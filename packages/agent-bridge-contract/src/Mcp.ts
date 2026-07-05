/**
 * Shared MCP `tools/call` result envelope, reused by any TS-side MCP tool
 * handler in this workspace (e.g. `apps/model-editor-mcp`).
 *
 * This file is TYPES ONLY — see `packages/agent-bridge-contract`'s
 * zero-runtime-exports test. No consts, no functions.
 */

/** A single content block of an MCP `tools/call` result (text-only, per the current tool set). */
export type McpContentItem = {
  type: "text";
  text: string;
};

/**
 * Result envelope returned by a TS tool handler and forwarded verbatim as the
 * `tools/call` JSON-RPC result. Mirrors (a subset of) the MCP spec's
 * `CallToolResult`.
 */
export type McpResult = {
  content: McpContentItem[];
  isError?: boolean;
  structuredContent?: unknown;
};
