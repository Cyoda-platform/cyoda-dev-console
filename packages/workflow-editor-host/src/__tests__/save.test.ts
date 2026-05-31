import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorSession } from "../useEditorSession.js";

const fixture = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "demo",
      initialState: "S",
      active: true,
      states: { S: { transitions: [] } },
    },
  ],
});

describe("useEditorSession.save", () => {
  it("writes serializeImportPayload output (no workflowUi)", async () => {
    const write = vi
      .fn()
      .mockResolvedValue({ lastModified: "2026-05-30T00:00:00Z", sizeBytes: 100 });
    const read = vi.fn().mockResolvedValue({ contents: fixture, lastModified: "..." });
    const { result } = renderHook(() =>
      useEditorSession({
        projectId: "p",
        filePath: "/tmp/wf.json",
        initialContents: fixture,
        io: { write, read },
      }),
    );
    await act(async () => {
      await result.current.save();
    });
    expect(write).toHaveBeenCalledOnce();
    const written = write.mock.calls[0]![1] as string;
    expect(written).not.toContain("workflowUi");
    expect(written).not.toContain("layout");
  });
});
