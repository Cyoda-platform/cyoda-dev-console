import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { scanProject } from "../ipc/project.js";
import { watchProject, onFileChanged } from "../ipc/watcher.js";
import { classifyWorkflowFile, type WorkflowFileIndexEntry, type WorkflowFileStatus } from "@cyoda/workflow-file-indexer";
import { FileTree } from "../components/FileTree.js";
import { useProjectStore } from "../state/projectStore.js";

export function ProjectRoute({
  onOpen,
  statusFilter,
  pathFilter,
}: {
  onOpen?: (entry: WorkflowFileIndexEntry) => void;
  statusFilter?: WorkflowFileStatus[];
  pathFilter?: (entry: WorkflowFileIndexEntry) => boolean;
}) {
  const active = useProjectStore((s) => s.active)!;
  const qc = useQueryClient();

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
        return onFileChanged(() => {
          void qc.invalidateQueries({ queryKey: ["scan", active.rootPath] });
        });
      })
      .then((unlisten) => {
        if (unlisten) cleanup = unlisten;
      });
    return () => {
      aborted = true;
      cleanup?.();
    };
  }, [active.rootPath, qc]);

  if (scan.isPending) return <div style={{ padding: 8 }}>Scanning…</div>;
  if (scan.isError) return <div style={{ padding: 8 }}>Scan failed: {String(scan.error)}</div>;

  let entries = statusFilter
    ? scan.data!.entries.filter((e) => statusFilter.includes(e.status))
    : scan.data!.entries;
  if (pathFilter) entries = entries.filter(pathFilter);

  return onOpen
    ? <FileTree entries={entries} onOpen={onOpen} />
    : <FileTree entries={entries} />;
}
