import { useState } from "react";
import { Button, Panel, useTokens } from "@cyoda/console-design-system";
import { PROVIDER_LIST, getProvider } from "./providers/index.js";
import { useAssistantConfig } from "./keyStore.js";

/**
 * Always-visible AI setup: choose a provider + model and paste an API key. Renders an
 * expanded card until a key is set for the active provider, then collapses to a one-line
 * summary with a "Change" affordance. Deliberately independent of any project/workflow
 * selection so key setup is reachable from a cold start.
 */
export function AiSetup() {
  const t = useTokens();
  const { provider, model, keys, setProvider, setModel, setKey } = useAssistantConfig();
  const providerDef = getProvider(provider);
  const apiKey = keys[provider] ?? "";
  const hasKey = apiKey.trim() !== "";
  // Start expanded when there is no key yet; stay expanded while typing until "Done".
  const [editing, setEditing] = useState(!hasKey);

  if (hasKey && !editing) {
    return (
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: t.space.sm, fontFamily: t.font.sans }}>
          <span style={{ color: t.color.success, fontWeight: 600 }}>✓</span>
          <span style={{ fontSize: t.font.sizes.md }}>
            {providerDef.label} · <code style={{ fontFamily: t.font.mono }}>{model}</code> · API key set
          </span>
          <Button variant="secondary" onClick={() => setEditing(true)} style={{ marginLeft: "auto" }}>
            Change
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Set up AI">
      <p style={{ marginTop: 0, fontFamily: t.font.sans, fontSize: t.font.sizes.md, color: t.color.textMuted }}>
        Choose a provider and paste your API key to start. This is the only setup needed — the
        Assistant runs against your own key.
      </p>
      <div style={{ display: "flex", gap: t.space.md, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            style={selectStyle(t)}
          >
            {PROVIDER_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model">
          <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle(t)}>
            {providerDef.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`API key (${providerDef.label})`}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setKey(provider, e.target.value)}
            placeholder="paste key — stored locally"
            style={{ ...selectStyle(t), minWidth: 300 }}
          />
        </Field>
        {hasKey && (
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Done
          </Button>
        )}
      </div>
      <div style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, marginTop: t.space.sm }}>
        Keys are stored in local storage on this device only, and sent solely to the chosen provider.
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: t.space.xs }}>
      <span style={{ fontSize: t.font.sizes.sm, fontWeight: 600, fontFamily: t.font.sans }}>{label}</span>
      {children}
    </label>
  );
}

function selectStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
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
