import { WarningBanner, useTokens } from "@cyoda/console-design-system";
import { AiSetup } from "./AiSetup.js";
import { ProposedChange } from "./ProposedChange.js";
import { ChatBubble, ChatComposer } from "./chatUi.js";
import type { AssistantChat } from "./useAssistantChat.js";

/**
 * Right-side assistant drawer scoped to the open workflow. Presentational: all chat state and
 * the apply behaviour live in the {@link AssistantChat} instance owned by `WorkflowRoute`, so
 * the conversation survives the drawer being toggled closed and reopened. Accepted proposals
 * are applied to the in-memory editor session (not disk) by that owner's `onApply`.
 */
export function WorkflowAssistantPanel({
  chat,
  displayName,
  relativePath,
  parseOk,
  dirty,
  onClose,
}: {
  chat: AssistantChat;
  displayName: string;
  relativePath: string;
  parseOk: boolean;
  dirty: boolean;
  onClose: () => void;
}) {
  const t = useTokens();
  const hasWorkflow = parseOk;

  return (
    <div
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: `1px solid ${t.color.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: t.color.surface,
      }}
    >
      {/* Header: AI Assistant · <file> */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: t.space.sm,
          padding: `${t.space.sm} ${t.space.md}`,
          borderBottom: `1px solid ${t.color.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: t.font.sans,
            fontWeight: 600,
            fontSize: t.font.sizes.md,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          AI Assistant · <span style={{ fontFamily: t.font.mono }}>{displayName}</span>
        </span>
        <button
          onClick={onClose}
          title="Close assistant"
          aria-label="Close assistant"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: t.color.textMuted,
            fontSize: t.font.sizes.md,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable body: context + setup + chat + proposal */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: t.space.md,
          display: "flex",
          flexDirection: "column",
          gap: t.space.md,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontFamily: t.font.sans,
            fontSize: t.font.sizes.sm,
            color: t.color.textMuted,
          }}
        >
          <span
            title={relativePath}
            style={{
              fontFamily: t.font.mono,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {relativePath}
          </span>
          <span>
            {hasWorkflow ? "Valid workflow" : "No valid workflow open"}
            {hasWorkflow && dirty ? " · unsaved changes" : ""}
          </span>
        </div>

        <AiSetup />

        {!hasWorkflow && (
          <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted }}>
            This file isn’t a valid workflow, so I can’t propose edits to it. You can still ask
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
            applyLabel="Apply to editor"
            onApply={() => void chat.applyProposal()}
            onCancel={chat.discardProposal}
          />
        )}

        {chat.applied && (
          <WarningBanner severity="success">
            {chat.applied} Review the graph, then Save to write to disk.
          </WarningBanner>
        )}
        {chat.error && (
          <div style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.danger }}>
            {chat.error}
          </div>
        )}
      </div>

      {/* Composer pinned to the bottom */}
      <div style={{ padding: t.space.md, borderTop: `1px solid ${t.color.border}`, flexShrink: 0 }}>
        <ChatComposer
          value={chat.input}
          onChange={chat.setInput}
          onSend={() => void chat.send()}
          sending={chat.sending}
          canSend={chat.canSend}
          placeholder={
            chat.hasKey
              ? "Ask about or change this workflow… (⌘/Ctrl+Enter to send)"
              : "Add an API key above to start"
          }
        />
      </div>
    </div>
  );
}
