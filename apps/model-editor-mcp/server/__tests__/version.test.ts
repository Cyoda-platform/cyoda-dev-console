import { describe, it, expect } from "vitest";
import { SERVER_NAME, SERVER_VERSION } from "../version.js";

describe("server identity", () => {
  it("advertises a stable name and semver version", () => {
    expect(SERVER_NAME).toBe("model-editor-mcp");
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });
});
