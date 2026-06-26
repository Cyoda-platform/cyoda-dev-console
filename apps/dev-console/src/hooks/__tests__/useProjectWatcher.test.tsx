import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { useProjectWatcher } from "../useProjectWatcher.js";
import { watchProject, unwatchProject, onFileChanged } from "../../ipc/watcher.js";

vi.mock("../../ipc/watcher.js", () => ({
  watchProject: vi.fn(),
  unwatchProject: vi.fn().mockResolvedValue(undefined),
  onFileChanged: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const qc = { invalidateQueries: vi.fn() } as unknown as QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  (watchProject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (onFileChanged as ReturnType<typeof vi.fn>).mockResolvedValue(() => {});
});

describe("useProjectWatcher", () => {
  it("watches the root on mount and invalidates the scan on file change", async () => {
    let handler: (() => void) | undefined;
    (onFileChanged as ReturnType<typeof vi.fn>).mockImplementation((h: () => void) => {
      handler = h;
      return Promise.resolve(() => {});
    });
    renderHook(() => useProjectWatcher("/a", qc));
    await waitFor(() => expect(watchProject).toHaveBeenCalledWith("/a"));
    await waitFor(() => expect(handler).toBeTypeOf("function"));
    handler!();
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["scan", "/a"] });
  });

  it("does no work when rootPath is null", () => {
    renderHook(() => useProjectWatcher(null, qc));
    expect(watchProject).not.toHaveBeenCalled();
    expect(unwatchProject).not.toHaveBeenCalled();
  });

  it("unwatches the old root on unmount", async () => {
    const { unmount } = renderHook(() => useProjectWatcher("/a", qc));
    await waitFor(() => expect(watchProject).toHaveBeenCalledWith("/a"));
    unmount();
    await waitFor(() => expect(unwatchProject).toHaveBeenCalledWith("/a"));
    expect(unwatchProject).toHaveBeenCalledTimes(1);
  });

  it("unwatches the old root only AFTER its watchProject resolves, and watches the new root", async () => {
    const d = deferred<void>();
    (watchProject as ReturnType<typeof vi.fn>).mockReturnValueOnce(d.promise); // "/a" pending
    const { rerender } = renderHook(({ rp }) => useProjectWatcher(rp, qc), {
      initialProps: { rp: "/a" },
    });
    rerender({ rp: "/b" }); // cleanup for "/a" scheduled, but watchProject("/a") still pending
    expect(unwatchProject).not.toHaveBeenCalled();
    d.resolve(); // now "/a" watch resolves
    await waitFor(() => expect(unwatchProject).toHaveBeenCalledWith("/a"));
    expect(unwatchProject).toHaveBeenCalledTimes(1);
    expect(watchProject).toHaveBeenCalledWith("/b");
  });
});
