import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorSession } from "../useEditorSession.js";

const io = () => ({ write: vi.fn(), read: vi.fn() });

// A workflow that fails to parse only because of `criterion: null` at the
// workflow root and on a transition (the shape cyoda-go emits).
const payloadWithNullCriteria = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "w",
      initialState: "A",
      active: true,
      criterion: null,
      states: {
        A: {
          transitions: [
            { name: "T", next: "B", manual: true, disabled: false, processors: [], criterion: null },
          ],
        },
        B: { transitions: [] },
      },
    },
  ],
});

const openSession = () =>
  renderHook(() =>
    useEditorSession({
      projectId: "p",
      filePath: "/tmp/wf.json",
      initialContents: payloadWithNullCriteria,
      io: io(),
    }),
  );

describe("useEditorSession — remediateNullCriteria", () => {
  it("fails to parse a workflow with null criteria before remediation", () => {
    const { result } = openSession();
    expect(result.current.parseOk).toBe(false);
    expect(result.current.document).toBeNull();
  });

  it("renders the workflow after dropping null criteria", () => {
    const { result } = openSession();
    act(() => {
      result.current.remediateNullCriteria();
    });
    expect(result.current.parseOk).toBe(true);
    expect(result.current.document).not.toBeNull();
  });

  it("marks the session dirty so the fix can be saved to disk", () => {
    const { result } = openSession();
    act(() => {
      result.current.remediateNullCriteria();
    });
    expect(result.current.dirty).toBe(true);
  });

  it("clears the null criteria from the session's raw content", () => {
    const { result } = openSession();
    act(() => {
      result.current.remediateNullCriteria();
    });
    expect(result.current.rawContent).not.toMatch(/"criterion":\s*null/);
  });
});
