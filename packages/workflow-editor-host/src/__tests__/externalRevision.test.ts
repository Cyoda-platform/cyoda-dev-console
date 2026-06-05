import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { parseImportPayload } from "@cyoda/workflow-core";
import { useEditorSession } from "../useEditorSession.js";

const fixture = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    { version: "1.0", name: "demo", initialState: "S", active: true, states: { S: { transitions: [] } } },
  ],
});

function harness() {
  const read = vi.fn().mockResolvedValue({ contents: fixture, lastModified: "..." });
  const write = vi.fn().mockResolvedValue({ lastModified: "...", sizeBytes: 1 });
  return renderHook(() =>
    useEditorSession({ projectId: "p", filePath: "/tmp/wf.json", initialContents: fixture, io: { write, read } }),
  );
}

describe("useEditorSession external-revision (drives editor remount)", () => {
  it("starts at 0 and is unchanged by an internal setDocument edit", () => {
    const { result } = harness();
    expect(result.current.externalRevision).toBe(0);

    const next = structuredClone(result.current.document!);
    act(() => result.current.setDocument(next));

    // Internal edits (the editor's own onChange) must NOT remount the editor.
    expect(result.current.externalRevision).toBe(0);
  });

  it("bumps when a document is applied externally", () => {
    const { result } = harness();
    const replacement = parseImportPayload(fixture).document!;

    act(() => result.current.applyExternalDocument(replacement));

    expect(result.current.externalRevision).toBe(1);
    expect(result.current.document).toEqual(replacement);
  });

  it("bumps on revert so a reload refreshes the graph", async () => {
    const { result } = harness();
    await act(async () => {
      await result.current.revert();
    });
    expect(result.current.externalRevision).toBe(1);
  });
});
