import { describe, it, expect } from "vitest";
import { matchGlob } from "../glob.js";

describe("matchGlob", () => {
  it("matches a top-level file against the default entityGlobs pattern", () => {
    expect(matchGlob("order.json", "**/*.json")).toBe(true);
  });

  it("matches a nested file against **/*.json", () => {
    expect(matchGlob("entities/order.json", "**/*.json")).toBe(true);
  });

  it("matches a deeply nested file against **/*.json", () => {
    expect(matchGlob("a/b/c/order.json", "**/*.json")).toBe(true);
  });

  it("rejects a non-matching extension", () => {
    expect(matchGlob("order.txt", "**/*.json")).toBe(false);
  });

  it("a single * does not cross a path-segment boundary", () => {
    expect(matchGlob("entities/order.json", "*.json")).toBe(false);
    expect(matchGlob("order.json", "*.json")).toBe(true);
  });

  it("matches literal path segments exactly", () => {
    expect(matchGlob("entities/order.json", "entities/*.json")).toBe(true);
    expect(matchGlob("other/order.json", "entities/*.json")).toBe(false);
  });

  it("escapes regex-special characters in the pattern", () => {
    expect(matchGlob("a.b.json", "a.b.json")).toBe(true);
    // '.' must be matched literally, not as "any character"
    expect(matchGlob("aXb.json", "a.b.json")).toBe(false);
  });

  it("rejects a path that is only a prefix/suffix match, not a full match", () => {
    expect(matchGlob("entities/order.json.bak", "**/*.json")).toBe(false);
    expect(matchGlob("not-entities/order.json", "entities/*.json")).toBe(false);
  });

  it("an empty pattern only matches an empty path", () => {
    expect(matchGlob("", "")).toBe(true);
    expect(matchGlob("order.json", "")).toBe(false);
  });
});
