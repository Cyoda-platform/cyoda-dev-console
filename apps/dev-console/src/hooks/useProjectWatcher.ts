import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { watchProject, unwatchProject, onFileChanged } from "../ipc/watcher.js";

export function useProjectWatcher(
  rootPath: string | null | undefined,
  qc: QueryClient,
): void {
  useEffect(() => {
    if (!rootPath) return;
    const root = rootPath;
    let aborted = false;
    let cleanup: (() => void) | null = null;
    const watching = watchProject(root)
      .then(() => {
        if (aborted) return;
        return onFileChanged(() => {
          void qc.invalidateQueries({ queryKey: ["scan", root] });
        });
      })
      .then((unlisten) => {
        if (unlisten) cleanup = unlisten;
      });
    return () => {
      aborted = true;
      cleanup?.();
      // Chain unwatch onto the watch promise so unwatch_project is sent only
      // after watch_project has resolved (handle inserted). A bare
      // `void unwatchProject(root)` races the pending watch and can leak.
      void watching.finally(() => unwatchProject(root));
    };
  }, [rootPath, qc]);
}
