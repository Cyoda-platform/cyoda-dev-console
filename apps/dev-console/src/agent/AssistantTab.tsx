import { useState } from "react";
import { Button, WarningBanner, useTokens } from "@cyoda/console-design-system";
import { readTextFile, writeTextFileWithConfirmedOverwrite } from "../ipc/fsio.js";
import { useAgentContext } from "./AgentContext.js";
import { useAssistantConfig } from "../assistant/keyStore.js";
import { complete } from "../assistant/llmClient.js";
import { buildSystemPrompt } from "../assistant/systemPrompt.js";
import { validateAndCanonicalize } from "../assistant/applyWorkflow.js";
import { AiSetup } from "../assistant/AiSetup.js";
import { ProposedChange } from "../assistant/ProposedChange.js";
import type { ChatMessage } from "../assistant/providers/index.js";

interface Proposal {
  current: string;
  canonical: string;
}

export function AssistantTab() {
  const t = useTokens();
  const ctx = useAgentContext();
  const { provider, model, keys } = useAssistantConfig();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  if (!ctx) {
    return (
      <div style={{ padding: t.space.lg, fontFamily: t.font.sans, color: t.color.textMuted }}>
        Open a project to use the assistant.
      </div>
    );
  }

  const workflowPath = ctx.selectedWorkflowPath;
  const apiKey = keys[provider] ?? "";
  const canSend = apiKey.trim() !== "" && input.trim() !== "" && !sending;

  async function send() {
    if (!ctx) return;
    const userText = input.trim();
    if (!userText) return;
    setInput("");
    setError(null);
    setApplied(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const current = workflowPath
        ? (await readTextFile(workflowPath, ctx.projectRoot)).contents
        : undefined;
      const system = buildSystemPrompt({
        ...(workflowPath ? { workflowRelPath: relativeOf(workflowPath, ctx.projectRoot) } : {}),
        ...(current !== undefined ? { currentJson: current } : {}),
      });
      const result = await complete({ provider, apiKey, model, system, messages: nextMessages });

      if (result.text) {
        setMessages((m) => [...m, { role: "assistant", content: result.text! }]);
      }
      if (result.toolCall) {
        if (!workflowPath || current === undefined) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Open a workflow file in the editor so I can apply this change." },
          ]);
        } else {
          const validated = validateAndCanonicalize(result.toolCall.workflowJson);
          if (validated.ok) {
            setProposal({ current, canonical: validated.canonical });
          } else {
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: "I proposed a change but it failed validation:\n- " + validated.issues.join("\n- "),
              },
            ]);
          }
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t.space.md, padding: t.space.lg, maxWidth: 820 }}>
      <AiSetup />

      {!workflowPath && (
        <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
          Open a workflow file in the editor and I can propose & apply edits. You can still ask
          general questions below.
        </div>
      )}

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
          placeholder={apiKey ? "Ask about or change the workflow… (⌘/Ctrl+Enter to send)" : "Add an API key above to start"}
          style={{ ...inputStyle(t), flex: 1, resize: "vertical" }}
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

function inputStyle(t: ReturnType<typeof useTokens>): React.CSSProperties {
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
