import { useCallback, useState } from "react";
import { useTokens } from "@cyoda/console-design-system";
import { ChatContent } from "./ChatContent.js";
import { ChatComposer } from "./chatUi.js";
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
  const [width, setWidth] = useState(380);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setWidth(Math.max(320, startWidth + delta));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  return (
    <>
      <div
        onMouseDown={handleResizeStart}
        style={{
          width: 3,
          flexShrink: 0,
          cursor: "col-resize",
          background: "transparent",
          borderLeft: `1px solid ${t.color.border}`,
          transition: "background 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = t.color.border)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      />
      <div
        style={{
          width,
          flexShrink: 0,
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

      {/* Scrollable body */}
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
        {/* Context: file path + parse/dirty status */}
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
            {parseOk ? "Valid workflow" : "No valid workflow open"}
            {parseOk && dirty ? " · unsaved changes" : ""}
          </span>
        </div>

        <ChatContent
          chat={chat}
          hint={
            !parseOk ? (
              <div
                style={{
                  fontFamily: t.font.sans,
                  fontSize: t.font.sizes.sm,
                  color: t.color.textMuted,
                }}
              >
                This file isn't a valid workflow, so I can't propose edits to it. You can
                still ask general questions below.
              </div>
            ) : undefined
          }
          applyLabel="Apply to editor"
          appliedSuffix="Review the graph, then Save to write to disk."
        />
      </div>

      {/* Composer pinned to the bottom */}
      <div
        style={{
          padding: t.space.md,
          borderTop: `1px solid ${t.color.border}`,
          flexShrink: 0,
        }}
      >
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
    </>
  );
}
