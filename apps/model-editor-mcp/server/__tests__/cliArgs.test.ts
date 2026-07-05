import { describe, it, expect } from "vitest";
import { DEFAULT_WORKFLOW_GLOBS, DEFAULT_ENTITY_GLOBS, parseGlobsArg } from "../cliArgs.js";

describe("parseGlobsArg", () => {
  it("falls back to the given default when the flag is omitted", () => {
    expect(parseGlobsArg(undefined, DEFAULT_WORKFLOW_GLOBS)).toBe(DEFAULT_WORKFLOW_GLOBS);
  });
  it("splits a comma-separated value and trims whitespace", () => {
    expect(parseGlobsArg("a/**/*.json, b/*.json", ["x"])).toEqual(["a/**/*.json", "b/*.json"]);
  });
  it("an explicitly empty string opts out entirely (returns []), not the default", () => {
    expect(parseGlobsArg("", ["x"])).toEqual([]);
  });
});

describe("narrow project-convention defaults", () => {
  it("are scoped subdirectories, not a full-tree **/*.json", () => {
    expect(DEFAULT_WORKFLOW_GLOBS).toEqual(["models/workflow/**/*.json"]);
    expect(DEFAULT_ENTITY_GLOBS).toEqual(["models/schema/**/*.json"]);
  });
});
