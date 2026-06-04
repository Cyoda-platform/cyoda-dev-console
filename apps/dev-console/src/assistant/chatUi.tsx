import { Button, useTokens } from "@cyoda/console-design-system";

/** One chat message bubble — user on the right (green), assistant on the left. */
export function ChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const t = useTokens();
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        background: isUser ? t.color.teal : t.color.surfaceAlt,
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

/** Textarea + Send button. ⌘/Ctrl+Enter sends when allowed. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  sending,
  canSend,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  canSend: boolean;
  placeholder: string;
}) {
  const t = useTokens();
  return (
    <div style={{ display: "flex", gap: t.space.sm }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        rows={2}
        placeholder={placeholder}
        style={{
          boxSizing: "border-box",
          padding: "6px 8px",
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.sm,
          background: t.color.surface,
          color: t.color.text,
          fontSize: t.font.sizes.md,
          fontFamily: t.font.sans,
          flex: 1,
          resize: "vertical",
        }}
      />
      <Button onClick={onSend} disabled={!canSend} style={{ alignSelf: "flex-end" }}>
        {sending ? "Sending…" : "Send"}
      </Button>
    </div>
  );
}
