import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { ok } from "../envelope.js";
import { startMcpServer } from "../mcp.js";

function drive(lines: string[]): Promise<Record<string, unknown>[]> {
  const input = new PassThrough(), output = new PassThrough();
  const received: Record<string, unknown>[] = [];
  output.on("data", (b: Buffer) => { for (const l of b.toString("utf8").split("\n")) if (l.trim()) received.push(JSON.parse(l)); });
  startMcpServer({
    tools: { show_workflow: async (a) => ok({ echoed: a }) },
    connectionUrl: "http://127.0.0.1:50000",
    input, output,
  });
  for (const l of lines) input.write(`${l}\n`);
  return new Promise((res) => setTimeout(() => res(received), 30));
}

describe("startMcpServer (stdio JSON-RPC)", () => {
  it("answers initialize and tools/list", async () => {
    const out = await drive([
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ]);
    const init = out.find((m) => m.id === 1) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("model-editor-mcp");
    const list = out.find((m) => m.id === 2) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain("show_workflow");
  });
  it("dispatches tools/call and returns the tool's result unmodified — no blanket _connection injection", async () => {
    const out = await drive([JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "show_workflow", arguments: { name: "Pledge" } } })]);
    const call = out.find((m) => m.id === 3) as { result: { structuredContent: { echoed: unknown; _connection?: unknown } } };
    expect(call.result.structuredContent.echoed).toEqual({ name: "Pledge" });
    expect(call.result.structuredContent._connection).toBeUndefined();
  });
});
