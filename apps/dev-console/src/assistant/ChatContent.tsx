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
}: {
  chat: AssistantChat;
  /** Rendered between AiSetup and the message list (e.g. "no workflow" notice). */
  hint?: ReactNode;
  /** Label for the proposal apply button. Defaults to "Apply to file". */
  applyLabel?: string;
  /** Extra text appended after chat.applied in the success banner. */
  appliedSuffix?: string;
}) {
  const t = useTokens();
  return (
    <>
      <AiSetup />

      {hint}

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
          {...(applyLabel ? { applyLabel } : {})}
          onApply={() => void chat.applyProposal()}
          onCancel={chat.discardProposal}
        />
      )}

      {chat.applied && (
        <WarningBanner severity="success">
          {chat.applied}
          {appliedSuffix ? ` ${appliedSuffix}` : ""}
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
