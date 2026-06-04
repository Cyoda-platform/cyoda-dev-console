import { useState } from "react";
import { Button, Panel, useTokens } from "@cyoda/console-design-system";
import { CustomSelect } from "../components/CustomSelect.js";
import { PROVIDER_LIST, getProvider } from "./providers/index.js";
import { useAssistantConfig } from "./keyStore.js";

export function AiSetup() {
  const t = useTokens();
  const { provider, model, keys, setProvider, setModel, setKey } = useAssistantConfig();
  const providerDef = getProvider(provider);
  const apiKey = keys[provider] ?? "";
  const hasKey = apiKey.trim() !== "";
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
          <CustomSelect
            value={provider}
            onChange={(v) => setProvider(v as typeof provider)}
            options={PROVIDER_LIST.map((p) => ({ value: p.id, label: p.label }))}
            style={{ width: 180 }}
          />
        </Field>
        <Field label="Model">
          <CustomSelect
            value={model}
            onChange={setModel}
            options={providerDef.models.map((m) => ({ value: m, label: m }))}
            style={{ width: 220 }}
          />
        </Field>
        <Field label={`API key (${providerDef.label})`}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setKey(provider, e.target.value)}
            placeholder="paste key — stored locally"
            style={inputStyle(t)}
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

function inputStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
  return {
    boxSizing: "border-box",
    padding: "0 10px",
    height: 34,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.md,
    background: t.color.surface,
    color: t.color.text,
    fontSize: t.font.sizes.md,
    fontFamily: t.font.sans,
    width: 320,
    outline: "none",
  };
}
