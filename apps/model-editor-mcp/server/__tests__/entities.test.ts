import { describe, it, expect, vi } from "vitest";
import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import type { ToolContext } from "../context.js";
import type { EntityFileEntry } from "../discovery.js";
import { listEntitiesTool, getEntityTool, createEntityTool, updateEntityTool, deleteEntityTool } from "../tools/entities.js";

/** A ToolContext backed by an in-memory file map + a fixed set of discovered entities. */
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

describe("listEntitiesTool", () => {
  it("returns { entities: [{ name, path }] } from discoverEntities", async () => {
    const r = await listEntitiesTool({}, ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }]));
    expect(JSON.parse(r.content[0]!.text)).toEqual({ entities: [{ name: "Foo", path: "models/schema/Foo.json" }] });
  });
  it("rejects unknown args", async () => {
    await expect(listEntitiesTool({ x: 1 }, ctx([]))).rejects.toMatchObject({ isError: true });
  });
});

describe("getEntityTool", () => {
  it("reads an existing entity's contents by name", async () => {
    const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }], { "models/schema/Foo.json": '{"a":1}' });
    const r = await getEntityTool({ name: "Foo" }, c);
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}' });
  });
  it("throws NOT_FOUND for an unknown name", async () => {
    await expect(getEntityTool({ name: "Nope" }, ctx([]))).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
    });
  });
});

describe("createEntityTool", () => {
  it("creates a new entity at a path derived from entityGlobs", async () => {
    const c = ctx([]);
    const r = await createEntityTool({ name: "Foo", content: '{"a":1}' }, c);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Foo", path: "models/schema/Foo.json" });
    expect(c.write).toHaveBeenCalledWith("models/schema/Foo.json", '{"a":1}');
  });
  it("creates the new entity NEXT TO the existing ones in a nested directory a ** glob spans, not at the glob's literal prefix (models/schema/v1/Bar.json, not models/schema/Bar.json)", async () => {
    const c = ctx([{ relativePath: "models/schema/v1/Foo.json", name: "Foo" }]);
    const r = await createEntityTool({ name: "Bar", content: '{"a":1}' }, c);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Bar", path: "models/schema/v1/Bar.json" });
    expect(c.write).toHaveBeenCalledWith("models/schema/v1/Bar.json", '{"a":1}');
  });
  it("rejects invalid JSON without writing", async () => {
    const c = ctx([]);
    await expect(createEntityTool({ name: "Foo", content: "{bad" }, c)).rejects.toMatchObject({ isError: true });
    expect(c.write).not.toHaveBeenCalled();
  });
  it("rejects a JSON array (not an object) without writing", async () => {
    const c = ctx([]);
    await expect(createEntityTool({ name: "Foo", content: "[1,2,3]" }, c)).rejects.toMatchObject({ isError: true });
    expect(c.write).not.toHaveBeenCalled();
  });
  it("rejects an already-existing name (ALREADY_EXISTS) without writing", async () => {
    const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }]);
    const r = createEntityTool({ name: "Foo", content: "{}" }, c);
    await expect(r).rejects.toMatchObject({ isError: true, content: [{ type: "text", text: expect.stringContaining("ALREADY_EXISTS") }] });
    expect(c.write).not.toHaveBeenCalled();
  });
  it("rejects (ALREADY_EXISTS) without writing when a non-object JSON file already occupies the resolved target path — discoverEntities skips non-objects, so findEntityByName alone would miss this and silently overwrite", async () => {
    const c = ctx([], { "models/schema/Foo.json": "[1,2,3]" });
    await expect(createEntityTool({ name: "Foo", content: '{"a":1}' }, c)).rejects.toMatchObject({
      isError: true, content: [{ type: "text", text: expect.stringContaining("ALREADY_EXISTS") }],
    });
    expect(c.write).not.toHaveBeenCalled();
  });
});

describe("updateEntityTool", () => {
  it("overwrites an existing entity's whole-document contents", async () => {
    const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }], { "models/schema/Foo.json": "{}" });
    const r = await updateEntityTool({ name: "Foo", content: '{"a":2}' }, c);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Foo", path: "models/schema/Foo.json" });
    expect(c.write).toHaveBeenCalledWith("models/schema/Foo.json", '{"a":2}');
  });
  it("throws NOT_FOUND without writing when the entity does not exist", async () => {
    const c = ctx([]);
    await expect(updateEntityTool({ name: "Nope", content: "{}" }, c)).rejects.toMatchObject({ isError: true });
    expect(c.write).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON without writing, even for an existing entity", async () => {
    const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }], { "models/schema/Foo.json": "{}" });
    await expect(updateEntityTool({ name: "Foo", content: "{bad" }, c)).rejects.toMatchObject({ isError: true });
    expect(c.write).not.toHaveBeenCalled();
  });
});

describe("deleteEntityTool", () => {
  it("deletes an existing entity", async () => {
    const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }]);
    const r = await deleteEntityTool({ name: "Foo" }, c);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Foo" });
    expect(c.deleteFile).toHaveBeenCalledWith("models/schema/Foo.json");
  });
  it("throws NOT_FOUND without deleting when the entity does not exist", async () => {
    const c = ctx([]);
    await expect(deleteEntityTool({ name: "Nope" }, c)).rejects.toMatchObject({ isError: true });
    expect(c.deleteFile).not.toHaveBeenCalled();
  });
});
