import { describe, it, expect } from "vitest";
import { toRelativePath } from "../pathUtils.js";

describe("toRelativePath", () => {
  it("strips the root prefix and leading slash", () => {
    expect(toRelativePath("/proj/wf/order.json", "/proj")).toBe("wf/order.json");
  });

  it("returns the original value when the path does not start with root", () => {
    expect(toRelativePath("/other/file.json", "/proj")).toBe("/other/file.json");
  });

  it("returns undefined when abs is undefined", () => {
    expect(toRelativePath(undefined, "/proj")).toBeUndefined();
  });
});
