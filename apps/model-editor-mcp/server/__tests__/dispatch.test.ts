import { describe, it, expect } from "vitest";
import { ok, err } from "../envelope.js";
import { makeDispatcher } from "../dispatch.js";

describe("dispatch", () => {
  it("routes to a registered handler", async () => {
    const d = makeDispatcher({ get_project: async () => ok({ root: "/x" }) });
    const r = await d("get_project", {});
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text)).toEqual({ root: "/x" });
  });

  it("returns an error envelope for unknown tools", async () => {
    const d = makeDispatcher({});
    const r = await d("nope", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("UNKNOWN_TOOL");
  });

  it("converts a thrown McpError into an error envelope", async () => {
    const d = makeDispatcher({
      boom: async () => {
        throw err("INVALID_JSON", "bad");
      },
    });
    const r = await d("boom", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("INVALID_JSON");
  });
});
