import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuid } from "uuid";
import { loadAppConfig, saveAppConfig } from "../ipc/config.js";
import { selectProjectRoot } from "../ipc/project.js";
import { useProjectStore } from "../state/projectStore.js";
import type { AppConfig, DevProject } from "@cyoda/workflow-project-model";
import { Button, EmptyState, FilePath, Panel, useTokens } from "@cyoda/console-design-system";

function ConfirmRemoveModal({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTokens();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
    >
      <Panel title="Remove project?">
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.text, margin: `0 0 ${t.space.sm}` }}>
          <strong>{projectName}</strong> will be removed from the project list.
          The files on disk are not affected.
        </p>
        <div style={{ display: "flex", gap: t.space.sm, justifyContent: "flex-end", marginTop: t.space.md }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Remove</Button>
        </div>
      </Panel>
    </div>
  );
}

function toRelative(abs: string, rootPath: string): string | null {
  const clean = abs.replace(/\/$/, "");
  if (clean === rootPath) return null;
  return clean.startsWith(rootPath + "/") ? clean.slice(rootPath.length + 1) : null;
}

export function SettingsRoute() {
  const t = useTokens();
  const qc = useQueryClient();
  const active = useProjectStore((s) => s.active);
  const setActive = useProjectStore((s) => s.setActive);
  const [configureOpenId, setConfigureOpenId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [scanRootError, setScanRootError] = useState<string | null>(null);

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
      workflowRoot: null,
      entityRoot: null,
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

  const updateProjectField = async (projectId: string, patch: Partial<DevProject>) => {
    const current = configQ.data!;
    const updated: AppConfig = {
      ...current,
      recentProjects: current.recentProjects.map((p) =>
        p.id === projectId ? { ...p, ...patch } : p,
      ),
    };
    await saveMutation.mutateAsync(updated);
    const updatedProject = updated.recentProjects.find((p) => p.id === projectId);
    if (updatedProject && active?.id === projectId) setActive(updatedProject);
  };

  const handleBrowseWorkflowRoot = async (p: DevProject) => {
    setScanRootError(null);
    const abs = await selectProjectRoot();
    if (!abs) return;
    const rel = toRelative(abs, p.rootPath);
    if (rel === null) {
      setScanRootError(`"${abs}" must be a subfolder inside the project root.`);
      return;
    }
    await updateProjectField(p.id, { workflowRoot: rel });
  };

  const handleBrowseEntityRoot = async (p: DevProject) => {
    setScanRootError(null);
    const abs = await selectProjectRoot();
    if (!abs) return;
    const rel = toRelative(abs, p.rootPath);
    if (rel === null) {
      setScanRootError(`"${abs}" must be a subfolder inside the project root.`);
      return;
    }
    await updateProjectField(p.id, { entityRoot: rel });
  };

  if (configQ.isPending)
    return <div style={{ padding: t.space.md, fontFamily: t.font.sans }}>Loading…</div>;
  if (configQ.isError)
    return <div style={{ padding: t.space.md, fontFamily: t.font.sans }}>Failed to load config</div>;

  const { recentProjects } = configQ.data;

  return (
    <>
    <div style={{ padding: t.space.lg, maxWidth: 900, margin: "0 auto", fontFamily: t.font.sans }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: t.space.lg }}>
        <h2 style={{ fontSize: t.font.sizes.xl, margin: 0, color: t.color.text }}>Projects</h2>
        <Button onClick={() => void handleOpenProject()}>Open project…</Button>
      </div>
      {recentProjects.length === 0 ? (
        <EmptyState title="No recent projects" description="Open a project folder to get started." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: t.space.md }}>
          {recentProjects.map((p) => {
            const isActive = active?.id === p.id;
            const configOpen = configureOpenId === p.id;
            return (
              <Panel key={p.id} style={isActive ? { borderLeft: `3px solid ${t.color.success}` } : undefined}>
                {/* Project name + path */}
                <div style={{ marginBottom: t.space.sm }}>
                  <div style={{ display: "flex", alignItems: "center", gap: t.space.sm, fontWeight: 600, fontSize: t.font.sizes.lg, marginBottom: t.space.xs }}>
                    {p.name}
                    {isActive && (
                      <span style={{
                        background: t.color.success,
                        color: "#fff",
                        borderRadius: 10,
                        padding: "1px 8px",
                        fontSize: t.font.sizes.sm,
                        fontWeight: 600,
                        lineHeight: "18px",
                      }}>
                        Active
                      </span>
                    )}
                  </div>
                  <FilePath path={p.rootPath} copyable />
                </div>

                {/* Actions row */}
                <div style={{ display: "flex", alignItems: "center", gap: t.space.sm, flexWrap: "wrap" }}>
                  <Button
                    variant="secondary"
                    onClick={() => setConfigureOpenId(configOpen ? null : p.id)}
                  >
                    {configOpen ? "Close config" : "Configure"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void handleSwitch(p)}
                    disabled={isActive}
                  >
                    Switch
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ color: t.color.danger, marginLeft: "auto" }}
                    onClick={() => setConfirmRemoveId(p.id)}
                  >
                    Remove
                  </Button>
                </div>

                {configOpen && (
                  <div style={{
                    marginTop: t.space.md,
                    paddingTop: t.space.md,
                    borderTop: `1px solid ${t.color.border ?? "#E0E0E0"}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: t.space.sm,
                  }}>
                    <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, color: t.color.textMuted }}>
                      Scan configuration
                    </div>

                    <ScanRootRow
                      label="Workflow root"
                      description="Only show workflows from this folder (leave empty to auto-detect)"
                      value={p.workflowRoot}
                      onBrowse={() => void handleBrowseWorkflowRoot(p)}
                      onClear={() => { setScanRootError(null); void updateProjectField(p.id, { workflowRoot: null }); }}
                      t={t}
                    />

                    <ScanRootRow
                      label="Entity root"
                      description="Only show entities from this folder (leave empty to auto-detect)"
                      value={p.entityRoot}
                      onBrowse={() => void handleBrowseEntityRoot(p)}
                      onClear={() => { setScanRootError(null); void updateProjectField(p.id, { entityRoot: null }); }}
                      t={t}
                    />

                    {scanRootError && (
                      <div style={{
                        fontSize: t.font.sizes.sm,
                        color: t.color.danger,
                        paddingTop: t.space.xs,
                      }}>
                        {scanRootError}
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>

    {confirmRemoveId !== null && (
      <ConfirmRemoveModal
        projectName={
          configQ.data?.recentProjects.find((p) => p.id === confirmRemoveId)?.name ?? ""
        }
        onConfirm={() => { void handleRemove(confirmRemoveId); setConfirmRemoveId(null); }}
        onCancel={() => setConfirmRemoveId(null)}
      />
    )}
    </>
  );
}

function ScanRootRow({
  label,
  description,
  value,
  onBrowse,
  onClear,
  t,
}: {
  label: string;
  description: string;
  value: string | null;
  onBrowse: () => void;
  onClear: () => void;
  t: ReturnType<typeof useTokens>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: t.space.md }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, marginBottom: t.space.xs }}>
          {description}
        </div>
        {value != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: t.space.sm }}>
            <FilePath path={value} copyable />
            <button
              onClick={onClear}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: t.font.sizes.sm,
                color: t.color.textMuted,
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <span style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, fontStyle: "italic" }}>
            Auto-detect
          </span>
        )}
      </div>
      <Button variant="secondary" onClick={onBrowse} style={{ flexShrink: 0, alignSelf: "flex-end" }}>
        Browse…
      </Button>
    </div>
  );
}
