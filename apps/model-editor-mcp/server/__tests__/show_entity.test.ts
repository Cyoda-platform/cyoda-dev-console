import { describe, it, expect, vi } from "vitest";
import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import type { ToolContext } from "../context.js";
import type { EntityFileEntry } from "../discovery.js";
import { showEntityTool } from "../tools/show_entity.js";

/** A ToolContext backed by an in-memory file map + a fixed set of discovered entities —
 *  mirrors the fake in `entities.test.ts`. */
function ctx(entities: EntityFileEntry[], files: Record<string, string> = {}, over: Partial<ToolContext> = {}): ToolContext {
  const writes: Record<string, string> = {};
  const deleted = new Set<string>();
  return {
    root: "/r",
    workflowGlobs: [],
    entityGlobs: ["models/schema/**/*.json"],
    connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => {
      if (deleted.has(rel)) throw new Error(`not found: ${rel}`);
      const c = writes[rel] ?? files[rel];
      if (c === undefined) throw new Error(`not found: ${rel}`);
      return { contents: c, lastModified: "t", sizeBytes: c.length };
    }),
    write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; deleted.delete(rel); return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
    deleteFile: vi.fn(async (rel: string) => { deleted.add(rel); }),
    discover: vi.fn(async () => []),
    discoverEntities: vi.fn(async () => entities),
    setGlobs: vi.fn(),
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
    ...over,
  };
}

describe("showEntityTool", () => {
  it("returns the raw entity read and pushes { entity, contents } via setShownEntity", async () => {
    const setShownEntity = vi.fn();
    const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo", lastModified: "t", sizeBytes: 1 }], { "models/schema/Foo.json": '{"a":1}' });
    const r = await showEntityTool({ name: "Foo" }, c, setShownEntity);
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}', lastModified: "t" });
    expect(setShownEntity).toHaveBeenCalledWith({ entity: "Foo", contents: '{"a":1}' });
  });
  it("throws NOT_FOUND for an unknown name and does NOT call setShownEntity", async () => {
    const setShownEntity = vi.fn();
    await expect(showEntityTool({ name: "Nope" }, ctx([]), setShownEntity)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
    expect(setShownEntity).not.toHaveBeenCalled();
  });
  it("rejects unknown args (INVALID_ARGS) without calling setShownEntity", async () => {
    const setShownEntity = vi.fn();
    await expect(showEntityTool({ name: "Foo", bogus: 1 }, ctx([{ relativePath: "models/schema/Foo.json", name: "Foo", lastModified: "t", sizeBytes: 1 }]), setShownEntity)).rejects.toMatchObject({ isError: true });
    expect(setShownEntity).not.toHaveBeenCalled();
  });
});
