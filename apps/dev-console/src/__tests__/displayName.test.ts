import { describe, it, expect } from "vitest";
import { deriveDisplayName } from "../utils/displayName.js";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

function entry(overrides: Partial<WorkflowFileIndexEntry> = {}): WorkflowFileIndexEntry {
  return {
    path: "/project/configs/greeting_workflow.json",
    relativePath: "configs/greeting_workflow.json",
    status: "valid-workflow",
    workflows: [],
    lastModified: "",
    sizeBytes: 0,
    ...overrides,
  };
}

describe("deriveDisplayName", () => {
  it("uses workflow name from JSON when available", () => {
    expect(
      deriveDisplayName(entry({ workflows: [{ name: "greeting_workflow" }] })),
    ).toBe("greeting");
  });

  it("strips _workflow suffix from workflow name", () => {
    expect(
      deriveDisplayName(entry({ workflows: [{ name: "order_workflow" }] })),
    ).toBe("order");
  });

  it("falls back to basename without .json when no workflow name", () => {
    expect(deriveDisplayName(entry({ workflows: [] }))).toBe("greeting");
  });

  it("strips _workflow suffix from basename fallback", () => {
    expect(
      deriveDisplayName(
        entry({ relativePath: "configs/payment_workflow.json", workflows: [] }),
      ),
    ).toBe("payment");
  });

  it("does not strip _workflow from non-suffix positions", () => {
    expect(
      deriveDisplayName(
        entry({ relativePath: "workflow_orders/order.json", workflows: [] }),
      ),
    ).toBe("order");
  });

  it("returns basename without extension for plain names", () => {
    expect(
      deriveDisplayName(entry({ relativePath: "models/order.json", workflows: [] })),
    ).toBe("order");
  });

  it("full path does not appear in the result", () => {
    const result = deriveDisplayName(entry({ workflows: [] }));
    expect(result).not.toContain("configs/");
    expect(result).not.toContain(".json");
  });
});
