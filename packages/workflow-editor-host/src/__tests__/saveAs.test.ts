import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorSession } from "../useEditorSession.js";

const FIXTURE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1.0", name: "demo", initialState: "S",
    active: true, states: { S: { transitions: [] } } }],
});

describe("useEditorSession saveAs", () => {
  it("calls io.saveAs with serialized payload and returns WriteResult", async () => {
    const saveAs = vi.fn().mockResolvedValue({
      path: "/new/path/wf.json",
      lastModified: "2026-05-31T00:00:00Z",
      sizeBytes: 200,
    });

    const { result } = renderHook(() =>
      useEditorSession({
        projectId: "p",
        filePath: "/tmp/wf.json",
        initialContents: FIXTURE,
        io: { write: vi.fn(), read: vi.fn(), saveAs },
      }),
    );

    let ret: unknown;
    await act(async () => {
      ret = await result.current.saveAs?.();
    });
    expect(saveAs).toHaveBeenCalledOnce();
    expect(ret).toMatchObject({ path: "/new/path/wf.json" });
  });

  it("saveAs is undefined when io.saveAs is not provided", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        projectId: "p",
        filePath: "/tmp/wf.json",
        initialContents: FIXTURE,
        io: { write: vi.fn(), read: vi.fn() },
      }),
    );
    expect(result.current.saveAs).toBeUndefined();
  });
});
