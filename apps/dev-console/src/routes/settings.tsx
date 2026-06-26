import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuid } from "uuid";
import { loadAppConfig, saveAppConfig } from "../ipc/config.js";
import { selectProjectRoot } from "../ipc/project.js";
import { useProjectStore } from "../state/projectStore.js";
import type { AppConfig, DevProject } from "@cyoda/workflow-project-model";
import { Button, EmptyState, FilePath, Panel, WarningBanner, useTokens } from "@cyoda/console-design-system";
import { ProjectNameField } from "../components/ProjectNameField.js";

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
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
      <Panel title={title}>
        <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.text, margin: `0 0 ${t.space.sm}` }}>
          {body}
        </p>
        <div style={{ display: "flex", gap: t.space.sm, justifyContent: "flex-end", marginTop: t.space.md }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
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
  const clearActive = useProjectStore((s) => s.clearActive);
  const [configureOpenId, setConfigureOpenId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [workflowRootError, setWorkflowRootError] = useState<string | null>(null);
  const [entityRootError, setEntityRootError] = useState<string | null>(null);

  const [tipsDismissed, setTipsDismissed] = useState<boolean>(
    () => localStorage.getItem("cyoda.setupTipsDismissed") === "1",
  );
  const dismissTips = () => {
    localStorage.setItem("cyoda.setupTipsDismissed", "1");
    setTipsDismissed(true);
  };
  const showTips = () => {
    localStorage.removeItem("cyoda.setupTipsDismissed");
    setTipsDismissed(false);
  };

  const [structureOpen, setStructureOpen] = useState(false);

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
    const wasActive = current.activeProjectId === projectId;
    const updated: AppConfig = {
      ...current,
      activeProjectId: wasActive ? null : current.activeProjectId,
      recentProjects: current.recentProjects.filter((p) => p.id !== projectId),
    };
    await saveMutation.mutateAsync(updated);
    if (wasActive) clearActive();
  };

  const updateProjectField = async (projectId: string, patch: Partial<DevProject>) => {
    const current = qc.getQueryData<AppConfig>(["app-config"]) ?? configQ.data!;
    const updated: AppConfig = {
      ...current,
      recentProjects: current.recentProjects.map((p) =>
        p.id === projectId ? { ...p, ...patch } : p,
      ),
    };
    qc.setQueryData(["app-config"], updated); // optimistic: next edit reads this
    await saveMutation.mutateAsync(updated);
    const updatedProject = updated.recentProjects.find((p) => p.id === projectId);
    if (updatedProject && active?.id === projectId) setActive(updatedProject);
  };

  const handleBrowseWorkflowRoot = async (p: DevProject) => {
    setWorkflowRootError(null);
    const abs = await selectProjectRoot();
    if (!abs) return;
    const rel = toRelative(abs, p.rootPath);
    if (rel === null) {
      setWorkflowRootError(`"${abs}" must be a subfolder inside the project root.`);
      return;
    }
    await updateProjectField(p.id, { workflowRoot: rel });
  };

  const handleBrowseEntityRoot = async (p: DevProject) => {
    setEntityRootError(null);
    const abs = await selectProjectRoot();
    if (!abs) return;
    const rel = toRelative(abs, p.rootPath);
    if (rel === null) {
      setEntityRootError(`"${abs}" must be a subfolder inside the project root.`);
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
      {tipsDismissed ? (
        <button
          type="button"
          onClick={showTips}
          style={{
            display: "block",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: t.color.textMuted,
            fontSize: t.font.sizes.sm,
            padding: 0,
            textDecoration: "underline",
            marginBottom: t.space.md,
          }}
        >
          Show setup tips
        </button>
      ) : (
        <div style={{ marginBottom: t.space.md, width: 0, minWidth: "100%", boxSizing: "border-box" }}>
          <WarningBanner severity="info" onDismiss={dismissTips}>
            <strong>Set your project folders explicitly.</strong> Auto-detection of
            workflow and entity files is still evolving and may not always pick the
            right files. For reliable results, open <strong>Configure</strong> on a
            project and set the workflow and entity folders explicitly.
          </WarningBanner>
        </div>
      )}
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
                    onClick={() => { setWorkflowRootError(null); setEntityRootError(null); setConfigureOpenId(configOpen ? null : p.id); }}
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
                    <ProjectNameField
                      name={p.name}
                      rootPath={p.rootPath}
                      onCommit={(name) => void updateProjectField(p.id, { name })}
                    />

                    <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, color: t.color.textMuted }}>
                      Scan configuration
                    </div>

                    <div>
                      <button
                        type="button"
                        aria-expanded={structureOpen}
                        onClick={() => setStructureOpen((v) => !v)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: t.space.xs,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: t.font.sizes.sm,
                          color: t.color.text,
                        }}
                      >
                        <span aria-hidden>{structureOpen ? "▾" : "▸"}</span>
                        Recommended folder structure
                      </button>
                      {structureOpen && (
                        <div style={{ marginTop: t.space.xs, width: 0, minWidth: "100%", boxSizing: "border-box", fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
                          <p style={{ margin: `0 0 ${t.space.xs}` }}>
                            Keep a versioned layout and a distinct file name per entity, so files
                            are easy to tell apart in the sidebar:
                          </p>
                          <pre
                            style={{
                              margin: 0,
                              padding: t.space.sm,
                              minWidth: 0,
                              background: t.color.surfaceMuted,
                              borderRadius: t.radius.sm,
                              fontFamily: t.font.mono,
                              fontSize: t.font.sizes.sm,
                              color: t.color.text,
                              overflowX: "auto",
                            }}
                          >
{`models/
  workflows/
    v1/
      order.json
      customer.json
  schema/
    v1/
      order.json
      customer.json`}
                          </pre>
                          <p style={{ margin: `${t.space.xs} 0 0` }}>
                            Each entity has a workflow file under <code>workflows/</code> and its
                            example data under <code>schema/</code>, both named for the entity (e.g.{" "}
                            <code>order.json</code>). Point <strong>Workflow root</strong> at{" "}
                            <code>models/workflows</code> and <strong>Entity root</strong> at{" "}
                            <code>models/schema</code>, and always include the model version
                            (<code>v1</code>, <code>v2</code>, …) to stay future-proof. Other layouts
                            work too — the keys are explicit roots, versioned folders, and distinct
                            per-entity file names.
                          </p>
                        </div>
                      )}
                    </div>

                    <ScanRootRow
                      label="Workflow root"
                      description="Only show workflows from this folder (leave empty to auto-detect)"
                      value={p.workflowRoot}
                      onBrowse={() => void handleBrowseWorkflowRoot(p)}
                      onClear={() => { setWorkflowRootError(null); void updateProjectField(p.id, { workflowRoot: null }); }}
                      error={workflowRootError}
                      t={t}
                    />

                    <ScanRootRow
                      label="Entity root"
                      description="Only show entities from this folder (leave empty to auto-detect)"
                      value={p.entityRoot}
                      onBrowse={() => void handleBrowseEntityRoot(p)}
                      onClear={() => { setEntityRootError(null); void updateProjectField(p.id, { entityRoot: null }); }}
                      error={entityRootError}
                      t={t}
                    />
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>

    {confirmRemoveId !== null && (
      <ConfirmModal
        title="Remove project?"
        body={
          <>
            <strong>
              {configQ.data?.recentProjects.find((p) => p.id === confirmRemoveId)?.name ?? ""}
            </strong>{" "}
            will be removed from the project list. The files on disk are not affected.
          </>
        }
        confirmLabel="Remove"
        confirmVariant="danger"
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
  error,
  t,
}: {
  label: string;
  description: string;
  value: string | null;
  onBrowse: () => void;
  onClear: () => void;
  error: string | null;
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
        {error && (
          <div style={{ fontSize: t.font.sizes.sm, color: t.color.danger, marginTop: t.space.xs }}>
            {error}
          </div>
        )}
      </div>
      <Button variant="secondary" onClick={onBrowse} style={{ flexShrink: 0, alignSelf: "flex-end" }}>
        Browse…
      </Button>
    </div>
  );
}
