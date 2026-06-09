import type { ReactNode } from "react";
import { WarningBanner, useTokens } from "@cyoda/console-design-system";
import { AiSetup } from "./AiSetup.js";
import { ProposedChange } from "./ProposedChange.js";
import { ChatBubble } from "./chatUi.js";
import type { AssistantChat } from "./useAssistantChat.js";

/**
 * Shared chat body used by both the full-page AssistantTab and the
 * sidebar WorkflowAssistantPanel. Renders: AiSetup → optional hint →
 * message list → pending proposal → applied/error feedback.
 *
 * ChatComposer is intentionally excluded — its placement differs between
 * consumers (inline vs pinned footer), so each consumer renders it.
 */
export function ChatContent({
  chat,
  hint,
  applyLabel,
  appliedSuffix,
  onUndoApply,
  canUndoApply,
}: {
  chat: AssistantChat;
  hint?: ReactNode;
  applyLabel?: string;
  appliedSuffix?: string;
  /** Called when the user clicks Undo after an AI apply. */
  onUndoApply?: () => void;
  /** Whether an AI-apply snapshot is available to undo. */
  canUndoApply?: boolean;
}) {
  const t = useTokens();
  return (
    <>
      <AiSetup />

      {hint}

      <div style={{ display: "flex", flexDirection: "column", gap: t.space.sm }}>
        {chat.messages.map((m) =>
          m.appliedProposal ? (
            <ProposedChange
              key={m.id}
              current={m.appliedProposal.current}
              proposed={m.appliedProposal.canonical}
              mode="applied"
            />
          ) : (
            <ChatBubble key={m.id} role={m.role} content={m.content} />
          )
        )}
      </div>

      {chat.proposal && (
        <ProposedChange
          current={chat.proposal.current}
          proposed={chat.proposal.canonical}
          applying={chat.applying}
          {...(applyLabel ? { applyLabel } : {})}
          onApply={() => void chat.applyProposal()}
          onCancel={chat.discardProposal}
        />
      )}

      {chat.applied && (
        <WarningBanner severity="success">
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
            <span>{chat.applied}{appliedSuffix ? ` ${appliedSuffix}` : ""}</span>
            {canUndoApply && onUndoApply && (
              <button
                type="button"
                onClick={onUndoApply}
                style={{
                  background: "none",
                  border: "1px solid currentColor",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: "2px 8px",
                  fontSize: "inherit",
                  color: "inherit",
                  flexShrink: 0,
                }}
              >
                Undo
              </button>
            )}
          </span>
        </WarningBanner>
      )}

      {chat.error && (
        <div
          style={{
            fontFamily: t.font.sans,
            fontSize: t.font.sizes.sm,
            color: t.color.danger,
          }}
        >
          {chat.error}
        </div>
      )}
    </>
  );
}
