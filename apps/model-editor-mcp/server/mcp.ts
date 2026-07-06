import { createInterface } from "node:readline";
import { makeDispatcher } from "./dispatch.js";
import type { ToolHandler } from "./envelope.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { TOOL_MANIFEST } from "./manifest.js";

/** Our OWN stdio request shape — deliberately not the contract's `McpToolInput`
 *  (its `callId` is a webview routing detail with no stdio meaning). */
export interface JsonRpcRequest { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: { name?: string; arguments?: unknown } }

export interface McpServerOptions {
  tools: Record<string, ToolHandler>;
  connectionUrl: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export function startMcpServer(opts: McpServerOptions): void {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const dispatch = makeDispatcher(opts.tools);
  const send = (msg: unknown): void => { output.write(`${JSON.stringify(msg)}\n`); };

  createInterface({ input }).on("line", (line) => { void handle(line); });

  async function handle(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req: JsonRpcRequest;
    try { req = JSON.parse(trimmed) as JsonRpcRequest; } catch { return; }

    switch (req.method) {
      case "initialize":
        send({ jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, instructions: SERVER_INSTRUCTIONS } });
        return;
      case "notifications/initialized":
        return;
      case "tools/list":
        send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOL_MANIFEST } });
        return;
      case "tools/call": {
        const result = await dispatch(String(req.params?.name ?? ""), req.params?.arguments);
        send({ jsonrpc: "2.0", id: req.id, result });
        return;
      }
      default:
        if (req.id !== undefined && req.id !== null) send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } });
    }
  }
}
