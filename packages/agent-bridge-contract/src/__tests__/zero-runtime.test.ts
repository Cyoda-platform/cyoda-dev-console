import { describe, it, expect } from "vitest";
import * as contract from "../index.js";

describe("agent-bridge-contract", () => {
  it("exports zero runtime values (types only)", () => {
    expect(Object.keys(contract)).toEqual([]);
  });
});
