import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../state/queryClient.js";
import { WorkflowRoute } from "../routes/workflow.js";

vi.mock("../ipc/fsio.js", () => ({
  readTextFile: vi.fn(),
  writeTextFileWithConfirmedOverwrite: vi.fn(),
  saveFileAs: vi.fn(),
}));
vi.mock("../ipc/watcher.js", () => ({
  onFileChanged: vi.fn().mockReturnValue(Promise.resolve(() => undefined)),
}));
vi.mock("../state/projectStore.js", () => ({
  useProjectStore: vi.fn().mockReturnValue("proj-1"),
}));
vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn().mockReturnValue(null) }));

const FIXTURE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1.0", name: "demo", initialState: "S",
    active: true, states: { S: { transitions: [] } } }],
});

describe("WorkflowRoute onDirtyChange", () => {
  it("calls onDirtyChange(false) on mount when content is clean", () => {
    const onDirtyChange = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowRoute
          filePath="/tmp/w.json"
          initialContents={FIXTURE}
          onClose={() => undefined}
          onDirtyChange={onDirtyChange}
        />
      </QueryClientProvider>,
    );
    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });
});
