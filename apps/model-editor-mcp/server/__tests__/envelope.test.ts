import { describe, it, expect } from "vitest";
import { validationFailed } from "../envelope.js";
import type { ValidationIssue } from "@cyoda/workflow-core";

describe("validationFailed", () => {
  it("produces the exact VALIDATION_FAILED envelope shape the tools rely on", () => {
    const issues: ValidationIssue[] = [{ severity: "error", code: "x", message: "boom" }];
    const r = validationFailed(issues);
    expect(r).toEqual({
      content: [{ type: "text", text: `VALIDATION_FAILED: ${JSON.stringify(issues)}` }],
      isError: true,
      structuredContent: { code: "VALIDATION_FAILED", diagnostics: issues },
    });
  });
});
