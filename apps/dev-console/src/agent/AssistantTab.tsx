import { useState } from "react";
import { Button, EmptyState, Panel, WarningBanner, useTokens } from "@cyoda/console-design-system";
import { readTextFile, writeTextFileWithConfirmedOverwrite } from "../ipc/fsio.js";
import { useAgentContext } from "./AgentContext.js";
import { PROVIDER_LIST, getProvider } from "../assistant/providers/index.js";
import type { ChatMessage } from "../assistant/providers/index.js";
import { useAssistantConfig } from "../assistant/keyStore.js";
import { complete } from "../assistant/llmClient.js";
import { buildSystemPrompt } from "../assistant/systemPrompt.js";
import { validateAndCanonicalize } from "../assistant/applyWorkflow.js";
import { ProposedChange } from "../assistant/ProposedChange.js";

interface Proposal {
  current: string;
  canonical: string;
}

export function AssistantTab() {
  const t = useTokens();
  const ctx = useAgentContext();
  const { provider, model, keys, setProvider, setModel, setKey } = useAssistantConfig();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  if (!ctx) {
    return <PadNote>Open a project to use the assistant.</PadNote>;
  }
  const workflowPath = ctx.selectedWorkflowPath;
  if (!workflowPath) {
    return (
      <EmptyState
        title="No workflow selected"
        description="Open a workflow file in the editor first; the assistant proposes edits to the selected workflow."
      />
    );
  }

  const apiKey = keys[provider] ?? "";
  const canSend = apiKey.trim() !== "" && input.trim() !== "" && !sending;

  async function send() {
    if (!workflowPath || !ctx) return;
    const userText = input.trim();
    if (!userText) return;
    setInput("");
    setError(null);
    setApplied(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const current = (await readTextFile(workflowPath, ctx.projectRoot)).contents;
      const system = buildSystemPrompt({
        ...(ctx.selectedWorkflowPath ? { workflowRelPath: relativeOf(ctx.selectedWorkflowPath, ctx.projectRoot) } : {}),
        currentJson: current,
      });
      const result = await complete({ provider, apiKey, model, system, messages: nextMessages });

      if (result.text) {
        setMessages((m) => [...m, { role: "assistant", content: result.text! }]);
      }
      if (result.toolCall) {
        const validated = validateAndCanonicalize(result.toolCall.workflowJson);
        if (validated.ok) {
          setProposal({ current, canonical: validated.canonical });
        } else {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "I proposed a change but it failed validation:\n- " +
                validated.issues.join("\n- ") +
                "\nAsk me to fix it.",
            },
          ]);
        }
      } else if (!result.text) {
        setMessages((m) => [...m, { role: "assistant", content: "(no response)" }]);
      }
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setSending(false);
    }
  }

  async function applyProposal() {
    if (!proposal || !workflowPath || !ctx) return;
    setApplying(true);
    setError(null);
    try {
      await writeTextFileWithConfirmedOverwrite(workflowPath, proposal.canonical, ctx.projectRoot);
      setProposal(null);
      setApplied(`Applied changes to ${relativeOf(workflowPath, ctx.projectRoot)}.`);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setApplying(false);
    }
  }

  const providerDef = getProvider(provider);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t.space.md, padding: t.space.lg, maxWidth: 820 }}>
      <Panel title="Provider">
        <div style={{ display: "flex", gap: t.space.md, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} style={selectStyle(t)}>
              {PROVIDER_LIST.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle(t)}>
              {providerDef.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label={`API key (${providerDef.label})`}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setKey(provider, e.target.value)}
              placeholder="paste key — stored locally"
              style={{ ...selectStyle(t), minWidth: 280 }}
            />
          </Field>
        </div>
        <div style={{ fontSize: t.font.sizes.sm, color: t.color.textMuted, marginTop: t.space.sm }}>
          Keys are stored in local storage on this device only, and sent solely to the chosen provider.
        </div>
      </Panel>

      <div style={{ display: "flex", flexDirection: "column", gap: t.space.sm }}>
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} />
        ))}
      </div>

      {proposal && (
        <ProposedChange
          current={proposal.current}
          proposed={proposal.canonical}
          applying={applying}
          onApply={() => void applyProposal()}
          onCancel={() => setProposal(null)}
        />
      )}

      {applied && <WarningBanner severity="warning">{applied}</WarningBanner>}
      {error && (
        <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.danger }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: t.space.sm }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (canSend) void send();
            }
          }}
          rows={2}
          placeholder={apiKey ? "Ask for a workflow change… (⌘/Ctrl+Enter to send)" : "Enter an API key above to start"}
          style={{ ...selectStyle(t), flex: 1, resize: "vertical", fontFamily: t.font.sans }}
        />
        <Button onClick={() => void send()} disabled={!canSend} style={{ alignSelf: "flex-end" }}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function ChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const t = useTokens();
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        background: isUser ? t.color.cyodaGreen : t.color.surfaceAlt,
        color: isUser ? "#fff" : t.color.text,
        borderRadius: t.radius.md,
        padding: `${t.space.sm} ${t.space.md}`,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.md,
        whiteSpace: "pre-wrap",
      }}
    >
      {content}
    </div>
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

function PadNote({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  return (
    <div style={{ padding: t.space.lg, fontFamily: t.font.sans, color: t.color.textMuted }}>{children}</div>
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

function relativeOf(abs: string, root: string): string {
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[/\\]+/, "") : abs;
}
