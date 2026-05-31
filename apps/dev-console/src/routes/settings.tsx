import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuid } from "uuid";
import { loadAppConfig, saveAppConfig } from "../ipc/config.js";
import { selectProjectRoot } from "../ipc/project.js";
import { useProjectStore } from "../state/projectStore.js";
import type { AppConfig, DevProject } from "@cyoda/workflow-project-model";
import { Button, EmptyState, FilePath, Panel } from "@cyoda/console-design-system";
import { useTokens } from "@cyoda/console-design-system";

export function SettingsRoute() {
  const t = useTokens();
  const qc = useQueryClient();
  const active = useProjectStore((s) => s.active);
  const setActive = useProjectStore((s) => s.setActive);

  const configQ = useQuery({ queryKey: ["app-config"], queryFn: loadAppConfig });

  const saveMutation = useMutation({
    mutationFn: saveAppConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-config"] }),
  });

  const handleOpenProject = async () => {
    const path = await selectProjectRoot();
    if (!path) return;
    const now = new Date().toISOString();
    const project: DevProject = {
      id: uuid(),
      name: path.split("/").pop() ?? path,
      rootPath: path,
      workflowGlobs: ["**/*.json"],
      entityGlobs: ["**/*.json"],
      createdAt: now,
      lastOpenedAt: now,
    };
    const current = configQ.data ?? { version: 1 as const, activeProjectId: null, recentProjects: [] };
    const without = current.recentProjects.filter((p) => p.rootPath !== path);
    const updated: AppConfig = {
      ...current,
      activeProjectId: project.id,
      recentProjects: [project, ...without].slice(0, 10),
    };
    await saveMutation.mutateAsync(updated);
    setActive(project);
  };

  const handleSwitch = async (project: DevProject) => {
    const current = configQ.data!;
    const updated: AppConfig = {
      ...current,
      activeProjectId: project.id,
      recentProjects: current.recentProjects.map((p) =>
        p.id === project.id ? { ...p, lastOpenedAt: new Date().toISOString() } : p,
      ),
    };
    await saveMutation.mutateAsync(updated);
    setActive(updated.recentProjects.find((p) => p.id === project.id)!);
  };

  const handleRemove = async (projectId: string) => {
    const current = configQ.data!;
    const updated: AppConfig = {
      ...current,
      activeProjectId: current.activeProjectId === projectId ? null : current.activeProjectId,
      recentProjects: current.recentProjects.filter((p) => p.id !== projectId),
    };
    await saveMutation.mutateAsync(updated);
  };

  if (configQ.isPending)
    return <div style={{ padding: t.space.md, fontFamily: t.font.sans }}>Loading…</div>;
  if (configQ.isError)
    return <div style={{ padding: t.space.md, fontFamily: t.font.sans }}>Failed to load config</div>;

  const { recentProjects } = configQ.data;

  return (
    <div style={{ padding: t.space.lg, maxWidth: 640, fontFamily: t.font.sans }}>
      <h2 style={{ fontSize: t.font.sizes.xl, marginTop: 0, marginBottom: t.space.md }}>Projects</h2>
      <Button onClick={() => void handleOpenProject()} style={{ marginBottom: t.space.lg }}>
        Open project…
      </Button>
      {recentProjects.length === 0 ? (
        <EmptyState title="No recent projects" description="Open a project folder to get started." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: t.space.sm }}>
          {recentProjects.map((p) => (
            <Panel key={p.id}>
              <div style={{ display: "flex", alignItems: "center", gap: t.space.md }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: t.font.sizes.md, marginBottom: t.space.xs }}>
                    {p.name}
                    {active?.id === p.id && (
                      <span style={{ marginLeft: t.space.sm, fontSize: t.font.sizes.sm, color: t.color.success }}>
                        (active)
                      </span>
                    )}
                  </div>
                  <FilePath path={p.rootPath} copyable />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void handleSwitch(p)}
                  disabled={active?.id === p.id}
                >
                  Switch
                </Button>
                <Button variant="danger" onClick={() => void handleRemove(p.id)}>
                  Remove
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
