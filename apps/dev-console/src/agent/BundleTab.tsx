import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CyodaProfile, TaskBundleRequest } from "@cyoda/agent-bridge-contract";
import { Button, Panel, useTokens } from "@cyoda/console-design-system";
import { readCyodaProfileConfig, writeProjectTextFile } from "../ipc/agent.js";
import { readTextFile } from "../ipc/fsio.js";
import { revealInFinder } from "../ipc/shell.js";
import { useAgentContext } from "./AgentContext.js";
import { parseProfileConfig } from "./profiles.js";
import { assembleBundle, BUNDLE_DIR } from "./bundle.js";
import { RULE_FILE_FOR_AGENT, type AgentId } from "./templates.js";

const AGENT_OPTIONS: { id: AgentId; label: string }[] = [
  { id: "claude", label: "Claude Code (CLAUDE.md)" },
  { id: "gemini", label: "Gemini CLI (GEMINI.md)" },
  { id: "codex", label: "Codex (AGENTS.md)" },
];

export function BundleTab() {
  const t = useTokens();
  const ctx = useAgentContext();
  const profilesQ = useQuery({
    queryKey: ["cyoda-profiles"],
    queryFn: async () => parseProfileConfig(await readCyodaProfileConfig()),
  });

  const [agent, setAgent] = useState<AgentId>("claude");
  const [profileName, setProfileName] = useState<string>("");
  const [includeWorkflow, setIncludeWorkflow] = useState(true);
  const [includeEntity, setIncludeEntity] = useState(true);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ paths: string[]; error?: string } | null>(null);

  if (!ctx) {
    return (
      <div style={{ padding: t.space.lg, fontFamily: t.font.sans, color: t.color.textMuted }}>
        Open a project to generate a task bundle into it.
      </div>
    );
  }

  const hasWorkflow = ctx.selectedWorkflowPath !== undefined;
  const hasEntity = ctx.selectedEntityPath !== undefined;
  const profiles = profilesQ.data?.profiles ?? {};
  const selectedProfileValue: CyodaProfile | undefined = profileName ? profiles[profileName] : undefined;
  const selectedProfile: { name: string; profile: CyodaProfile } | undefined = selectedProfileValue
    ? { name: profileName, profile: selectedProfileValue }
    : undefined;

  async function writeBundle() {
    if (!ctx) return;
    setBusy(true);
    setResult(null);
    try {
      const workflowJson =
        includeWorkflow && ctx.selectedWorkflowPath
          ? (await readTextFile(ctx.selectedWorkflowPath, ctx.projectRoot)).contents
          : undefined;
      const entitySampleJson =
        includeEntity && ctx.selectedEntityPath
          ? (await readTextFile(ctx.selectedEntityPath, ctx.projectRoot)).contents
          : undefined;

      const request: TaskBundleRequest = {
        targetProjectPath: ctx.projectRoot,
        agentRuleFile: RULE_FILE_FOR_AGENT[agent],
        includeWorkflowJson: includeWorkflow && hasWorkflow,
        includeEntitySampleJson: includeEntity && hasEntity,
        ...(selectedProfile ? { cyodaProfile: selectedProfile.name } : {}),
        consoleEnvironment: selectedProfile?.profile.env ?? "development",
        apiBaseUrl: selectedProfile?.profile.endpoint ?? "",
      };

      const files = assembleBundle({
        request,
        context: ctx,
        ...(selectedProfile ? { profile: selectedProfile } : {}),
        ...(workflowJson !== undefined ? { workflowJson } : {}),
        ...(entitySampleJson !== undefined ? { entitySampleJson } : {}),
        ...(brief.trim() ? { brief: brief.trim() } : {}),
      });

      const written: string[] = [];
      for (const f of files) {
        const res = await writeProjectTextFile(ctx.projectRoot, f.relativePath, f.contents);
        written.push(res.path);
      }
      setResult({ paths: written });
    } catch (e) {
      setResult({ paths: [], error: (e as Error).message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }

  const label: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: t.space.xs,
    fontFamily: t.font.sans,
    fontSize: t.font.sizes.md,
  };

  return (
    <div style={{ padding: t.space.lg, maxWidth: 640, display: "flex", flexDirection: "column", gap: t.space.md }}>
      <p style={{ margin: 0, fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
        A <strong>task bundle</strong> is a folder of context files (a brief, the selected
        workflow/entity, profile setup notes) that you hand to an external CLI agent. It is
        optional — the in-app Assistant above does not need it.
      </p>
      <Panel title="Task bundle">
        <div style={{ display: "flex", flexDirection: "column", gap: t.space.md }}>
          <div>
            <FieldLabel>Agent target</FieldLabel>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value as AgentId)}
              style={selectStyle(t)}
            >
              {AGENT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Cyoda profile</FieldLabel>
            <select
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              style={selectStyle(t)}
            >
              <option value="">No profile (local / unset)</option>
              {Object.entries(profiles).map(([name, p]) => (
                <option key={name} value={name}>
                  {name} ({p.env})
                </option>
              ))}
            </select>
          </div>

          <label style={label}>
            <input
              type="checkbox"
              checked={includeWorkflow && hasWorkflow}
              disabled={!hasWorkflow}
              onChange={(e) => setIncludeWorkflow(e.target.checked)}
            />
            Include selected workflow JSON {hasWorkflow ? "" : "(none selected)"}
          </label>

          <label style={label}>
            <input
              type="checkbox"
              checked={includeEntity && hasEntity}
              disabled={!hasEntity}
              onChange={(e) => setIncludeEntity(e.target.checked)}
            />
            Include selected entity JSON {hasEntity ? "" : "(none selected)"}
          </label>

          <div>
            <FieldLabel>Brief (optional)</FieldLabel>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="Describe what you want the agent to do…"
              style={{ ...selectStyle(t), resize: "vertical", fontFamily: t.font.sans }}
            />
          </div>

          <Button onClick={() => void writeBundle()} disabled={busy}>
            {busy ? "Writing…" : `Write bundle to ${BUNDLE_DIR}/`}
          </Button>
        </div>
      </Panel>

      {result && !result.error && (
        <Panel title="Bundle written">
          <ul style={{ margin: 0, paddingLeft: t.space.lg, fontFamily: t.font.mono, fontSize: t.font.sizes.sm }}>
            {result.paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Button
            variant="secondary"
            onClick={() => void revealInFinder(`${ctx.projectRoot}/${BUNDLE_DIR}`)}
            style={{ marginTop: t.space.sm }}
          >
            Reveal in Finder
          </Button>
        </Panel>
      )}
      {result?.error && (
        <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.danger }}>
          Failed: {result.error}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{ fontSize: t.font.sizes.sm, fontWeight: 600, marginBottom: t.space.xs, fontFamily: t.font.sans }}>
      {children}
    </div>
  );
}

function selectStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.sm,
    background: t.color.surface,
    color: t.color.text,
    fontSize: t.font.sizes.md,
    fontFamily: t.font.sans,
  };
}
