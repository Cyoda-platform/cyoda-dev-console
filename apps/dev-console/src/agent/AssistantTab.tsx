import { useEffect, useRef } from "react";
import { WarningBanner, useTokens } from "@cyoda/console-design-system";
import { readTextFile, writeTextFileWithConfirmedOverwrite } from "../ipc/fsio.js";
import { useAgentContext } from "./AgentContext.js";
import { useAssistantChat } from "../assistant/useAssistantChat.js";
import { AiSetup } from "../assistant/AiSetup.js";
import { ProposedChange } from "../assistant/ProposedChange.js";
import { ChatBubble, ChatComposer } from "../assistant/chatUi.js";
import { toRelativePath } from "./pathUtils.js";

/**
 * Full-page assistant (kept for setup / general use, reachable from the AI route). Uses the
 * shared {@link useAssistantChat} state machine; its context comes from disk and accepted
 * proposals are written to disk — distinct from the in-editor workflow drawer, which applies
 * to the editor session instead.
 */
export function AssistantTab() {
  const t = useTokens();
  const ctx = useAgentContext();
  const workflowPath = ctx?.selectedWorkflowPath;
  const projectRoot = ctx?.projectRoot;

  const chat = useAssistantChat({
    getCurrentJson: async () =>
      workflowPath && projectRoot
        ? (await readTextFile(workflowPath, projectRoot)).contents
        : undefined,
    ...(workflowPath && projectRoot ? { relPath: toRelativePath(workflowPath, projectRoot) ?? workflowPath } : {}),
    onApply: async (canonical) => {
      if (!workflowPath || !projectRoot) return;
      await writeTextFileWithConfirmedOverwrite(workflowPath, canonical, projectRoot);
    },
  });

  // Keep a stable ref to discardProposal so the effect below doesn't re-fire on
  // every render (discardProposal is a new reference each render).
  const discardRef = useRef(chat.discardProposal);
  useEffect(() => { discardRef.current = chat.discardProposal; });

  // Clear any pending proposal when the workflow context changes.
  // The proposal was computed against the old workflow and must not be applied to the new one.
  // Skip the initial mount — only discard when the path actually changes to a new value.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    discardRef.current();
  }, [workflowPath]);

  if (!ctx) {
    return (
      <div style={{ padding: t.space.lg, fontFamily: t.font.sans, color: t.color.textMuted }}>
        Open a project to use the assistant.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: t.space.md, padding: t.space.lg }}>
      <AiSetup />

      {!workflowPath && (
        <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
          Open a workflow file in the editor and I can propose & apply edits. You can still ask
          general questions below.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: t.space.sm }}>
        {chat.messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} content={m.content} />
        ))}
      </div>

      {chat.proposal && (
        <ProposedChange
          current={chat.proposal.current}
          proposed={chat.proposal.canonical}
          applying={chat.applying}
          onApply={() => void chat.applyProposal()}
          onCancel={chat.discardProposal}
        />
      )}

      {chat.applied && <WarningBanner severity="warning">{chat.applied}</WarningBanner>}
      {chat.error && (
        <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.danger }}>{chat.error}</div>
      )}

      <ChatComposer
        value={chat.input}
        onChange={chat.setInput}
        onSend={() => void chat.send()}
        sending={chat.sending}
        canSend={chat.canSend}
        placeholder={chat.hasKey ? "Ask about or change the workflow… (⌘/Ctrl+Enter to send)" : "Add an API key above to start"}
      />
    </div>
  );
}

