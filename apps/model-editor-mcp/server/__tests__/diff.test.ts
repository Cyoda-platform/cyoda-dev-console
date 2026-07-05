import { describe, it, expect } from "vitest";
import { jsonDiff } from "../diff.js";

describe("jsonDiff", () => {
  it("emits replace/add/remove ops", () => {
    expect(jsonDiff({ a: 1, b: 2 }, { a: 1, b: 3 })).toContainEqual({ op: "replace", path: "/b", value: 3 });
    expect(jsonDiff({ a: 1 }, { a: 1, c: 9 })).toContainEqual({ op: "add", path: "/c", value: 9 });
    expect(jsonDiff({ a: 1, d: 4 }, { a: 1 })).toContainEqual({ op: "remove", path: "/d" });
  });

  it("surfaces array reordering as index-level changes", () => {
    const ops = jsonDiff({ t: ["x", "y"] }, { t: ["y", "x"] });
    expect(ops.length).toBeGreaterThan(0);
  });

  it("returns no ops for deep-equal values", () => {
    expect(jsonDiff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
    expect(jsonDiff(null, null)).toEqual([]);
  });

  it("recurses into nested objects/arrays with JSON-Pointer paths", () => {
    const before = { states: { a: { transitions: [{ name: "go" }] } } };
    const after = { states: { a: { transitions: [{ name: "stop" }] } } };
    expect(jsonDiff(before, after)).toContainEqual({
      op: "replace",
      path: "/states/a/transitions/0/name",
      value: "stop",
    });
  });

  it("grows/shrinks arrays as index-level add/remove", () => {
    expect(jsonDiff({ t: [1] }, { t: [1, 2] })).toContainEqual({ op: "add", path: "/t/1", value: 2 });
    expect(jsonDiff({ t: [1, 2] }, { t: [1] })).toContainEqual({ op: "remove", path: "/t/1" });
  });

  it("escapes ~ and / in object keys per JSON Pointer (RFC 6901)", () => {
    expect(jsonDiff({}, { "a/b~c": 1 })).toContainEqual({ op: "add", path: "/a~1b~0c", value: 1 });
  });

  it("replaces at the root when top-level types are incompatible", () => {
    expect(jsonDiff({ a: 1 }, [1, 2])).toEqual([{ op: "replace", path: "", value: [1, 2] }]);
  });
});
