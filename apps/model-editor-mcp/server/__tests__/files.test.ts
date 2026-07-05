import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfinementError, readConfined, writeConfined, rmConfined } from "../files.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-files-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("readConfined", () => {
  it("reads a file inside the root and reports mtime + size", async () => {
    await writeFile(join(root, "w.json"), "{}");
    const r = await readConfined(root, "w.json");
    expect(r.contents).toBe("{}");
    expect(r.sizeBytes).toBe(2);
    expect(typeof r.lastModified).toBe("string");
  });
  it("rejects a traversal path", async () => {
    await expect(readConfined(root, "../etc/passwd")).rejects.toBeInstanceOf(ConfinementError);
  });
  it("rejects an absolute path", async () => {
    await expect(readConfined(root, "/etc/passwd")).rejects.toBeInstanceOf(ConfinementError);
  });
  it("rejects a read whose path symlinks outside the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mem-out-"));
    await writeFile(join(outside, "secret.json"), '{"secret":true}');
    await symlink(outside, join(root, "sub"));
    await expect(readConfined(root, "sub/secret.json")).rejects.toBeInstanceOf(ConfinementError);
    await rm(outside, { recursive: true, force: true });
  });
});

describe("writeConfined", () => {
  it("atomically writes a file, creating intermediate dirs", async () => {
    const res = await writeConfined(root, "flows/w.json", '{"a":1}');
    expect(await readFile(join(root, "flows/w.json"), "utf8")).toBe('{"a":1}');
    expect(res.sizeBytes).toBe(7);
  });
  it("leaves no .tmp file behind after a successful write", async () => {
    await writeConfined(root, "w.json", "{}");
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(root);
    expect(names.filter((n) => n.endsWith(".tmp"))).toHaveLength(0);
    expect(names).toContain("w.json");
  });
  it("rejects a traversal path without writing", async () => {
    await expect(writeConfined(root, "../evil.json", "{}")).rejects.toBeInstanceOf(ConfinementError);
  });
  it("rejects a write whose parent symlinks outside the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mem-out-"));
    await mkdir(join(root, "sub"), { recursive: true });
    await rm(join(root, "sub"), { recursive: true, force: true });
    await symlink(outside, join(root, "sub"));
    await expect(writeConfined(root, "sub/evil.json", "{}")).rejects.toBeInstanceOf(ConfinementError);
    await rm(outside, { recursive: true, force: true });
  });
  it("creates no directories outside root when a non-immediate ancestor symlinks out", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mem-out-"));
    await symlink(outside, join(root, "sub"));
    const { readdir } = await import("node:fs/promises");
    const before = await readdir(outside);
    await expect(writeConfined(root, "sub/nested/deep/evil.json", "{}")).rejects.toBeInstanceOf(ConfinementError);
    const after = await readdir(outside);
    expect(after).toEqual(before);
    expect(after).toHaveLength(0);
    await rm(outside, { recursive: true, force: true });
  });
});

describe("rmConfined", () => {
  it("deletes a file inside the root", async () => {
    await writeFile(join(root, "e.json"), "{}");
    await rmConfined(root, "e.json");
    await expect(readFile(join(root, "e.json"), "utf8")).rejects.toThrow();
  });
  it("rejects a traversal path without deleting anything", async () => {
    await writeFile(join(root, "e.json"), "{}");
    await expect(rmConfined(root, "../e.json")).rejects.toBeInstanceOf(ConfinementError);
    expect(await readFile(join(root, "e.json"), "utf8")).toBe("{}"); // untouched
  });
  it("rejects deleting a path that symlinks outside the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mem-out-"));
    await writeFile(join(outside, "secret.json"), "{}");
    await symlink(join(outside, "secret.json"), join(root, "link.json"));
    await expect(rmConfined(root, "link.json")).rejects.toBeInstanceOf(ConfinementError);
    await rm(outside, { recursive: true, force: true });
  });
  it("propagates ENOENT for a nonexistent (but confined) path", async () => {
    await expect(rmConfined(root, "nope.json")).rejects.toThrow();
  });
});
