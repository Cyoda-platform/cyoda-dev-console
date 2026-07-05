import { describe, it, expect } from "vitest";
import type { ToolContext } from "../context.js";
import { connectionInfoTool } from "../tools/connection_info.js";

function ctxWithUrl(connectionUrl: string): ToolContext {
  return { connectionUrl } as unknown as ToolContext;
}

describe("connectionInfoTool", () => {
  it("returns the browser url and its numeric port", async () => {
    const r = await connectionInfoTool({}, ctxWithUrl("http://127.0.0.1:53821/?token=abc"));
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text)).toEqual({ url: "http://127.0.0.1:53821/?token=abc", port: 53821 });
    expect(r.structuredContent).toEqual({ url: "http://127.0.0.1:53821/?token=abc", port: 53821 });
  });
  it("rejects unknown args", async () => {
    await expect(connectionInfoTool({ x: 1 }, ctxWithUrl("http://127.0.0.1:1/"))).rejects.toMatchObject({ isError: true });
  });
});
