import { describe, it, expect } from "vitest";
import type { ValidationIssue } from "@cyoda/workflow-core";
import { dropNullCriteria, nullCriterionPaths } from "../nullCriterion.js";

const workflowWith = (criterion: unknown, transitionCriterion: unknown) =>
  JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "w",
        initialState: "A",
        active: true,
        criterion,
        states: {
          A: {
            transitions: [
              { name: "T", next: "B", manual: true, disabled: false, processors: [], criterion: transitionCriterion },
            ],
          },
          B: { transitions: [] },
        },
      },
    ],
  });

const groupCriterion = {
  type: "group",
  operator: "AND",
  conditions: [{ type: "simple", jsonPath: "$.x", operatorType: "NOT_NULL", value: null }],
};

const errorAt = (path: (string | number)[]): ValidationIssue => ({
  severity: "error",
  code: "schema-invalid_union",
  message: "Invalid input",
  detail: { path },
});

describe("dropNullCriteria", () => {
  it("removes a transition-level criterion that is null", () => {
    const cleaned = JSON.parse(dropNullCriteria(workflowWith(groupCriterion, null)));
    const transition = cleaned.workflows[0].states.A.transitions[0];
    expect("criterion" in transition).toBe(false);
  });

  it("removes a workflow-root criterion that is null", () => {
    const cleaned = JSON.parse(dropNullCriteria(workflowWith(null, groupCriterion)));
    expect("criterion" in cleaned.workflows[0]).toBe(false);
  });

  it("preserves a criterion that is not null", () => {
    const cleaned = JSON.parse(dropNullCriteria(workflowWith(null, groupCriterion)));
    expect(cleaned.workflows[0].states.A.transitions[0].criterion).toEqual(groupCriterion);
  });

  it("returns the input unchanged when it is not valid JSON", () => {
    expect(dropNullCriteria("{not json")).toBe("{not json");
  });
});

describe("nullCriterionPaths", () => {
  it("returns dotted paths for error issues that point at a null criterion", () => {
    const raw = workflowWith(null, null);
    const issues = [errorAt(["workflows", 0, "criterion"]), errorAt(["workflows", 0, "states", "A", "transitions", 0, "criterion"])];
    expect(nullCriterionPaths(raw, issues)).toEqual([
      "workflows.0.criterion",
      "workflows.0.states.A.transitions.0.criterion",
    ]);
  });

  it("ignores criterion issues when the criterion value is not null", () => {
    const raw = workflowWith(null, groupCriterion);
    const issues = [errorAt(["workflows", 0, "states", "A", "transitions", 0, "criterion"])];
    expect(nullCriterionPaths(raw, issues)).toEqual([]);
  });

  it("ignores issues that are not about a criterion", () => {
    const raw = workflowWith(null, null);
    const issues = [errorAt(["workflows", 0, "initialState"])];
    expect(nullCriterionPaths(raw, issues)).toEqual([]);
  });
});
