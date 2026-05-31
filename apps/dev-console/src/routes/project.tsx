import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { scanProject } from "../ipc/project.js";
import { watchProject, onFileChanged } from "../ipc/watcher.js";
import { classifyWorkflowFile, type WorkflowFileIndexEntry, type WorkflowFileStatus } from "@cyoda/workflow-file-indexer";
import { FileTree } from "../components/FileTree.js";
import { useProjectStore } from "../state/projectStore.js";

export function ProjectRoute({
  onOpen,
  statusFilter,
}: {
  onOpen?: (entry: WorkflowFileIndexEntry) => void;
  statusFilter?: WorkflowFileStatus[];
}) {
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
    let aborted = false;
    let cleanup: (() => void) | null = null;
    void watchProject(active.rootPath)
      .then(() => {
        if (aborted) return;
        return onFileChanged((evt) => {
          console.log("external change", evt);
        });
      })
      .then((unlisten) => {
        if (unlisten) cleanup = unlisten;
      });
    return () => {
      aborted = true;
      cleanup?.();
    };
  }, [active.rootPath]);

  if (scan.isPending) return <div style={{ padding: 8 }}>Scanning…</div>;
  if (scan.isError) return <div style={{ padding: 8 }}>Scan failed: {String(scan.error)}</div>;

  const entries = statusFilter
    ? scan.data!.entries.filter((e) => statusFilter.includes(e.status))
    : scan.data!.entries;

  return onOpen
    ? <FileTree entries={entries} onOpen={onOpen} />
    : <FileTree entries={entries} />;
}
