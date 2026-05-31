import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { scanProject } from "../ipc/project.js";
import { watchProject, onFileChanged } from "../ipc/watcher.js";
import { classifyWorkflowFile } from "@cyoda/workflow-file-indexer";
import { FileTree } from "../components/FileTree.js";
import { useProjectStore } from "../state/projectStore.js";

export function ProjectRoute() {
  const active = useProjectStore((s) => s.active)!;

  const scan = useQuery({
    queryKey: ["scan", active.rootPath],
    queryFn: async () => {
      const result = await scanProject(active.rootPath);
      const entries = result.files.map((f) =>
        classifyWorkflowFile({
          path: f.path,
          relativePath: f.relativePath,
          contents: f.contents,
          lastModified: f.lastModified,
          sizeBytes: f.sizeBytes,
        }),
      );
      return { ...result, entries };
    },
  });

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    void watchProject(active.rootPath)
      .then(() =>
        onFileChanged((evt) => {
          console.log("external change", evt);
        }),
      )
      .then((unlisten) => {
        cleanup = unlisten;
      });
    return () => cleanup?.();
  }, [active.rootPath]);

  if (scan.isLoading) return <div>Scanning…</div>;
  if (scan.isError) return <div>Scan failed: {String(scan.error)}</div>;
  return <FileTree entries={scan.data!.entries} />;
}
