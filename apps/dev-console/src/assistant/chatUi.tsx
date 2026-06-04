import { useState } from "react";
import { Send } from "lucide-react";
import { useTokens } from "@cyoda/console-design-system";

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
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        rows={3}
        placeholder={placeholder}
        style={{
          boxSizing: "border-box",
          padding: "8px 40px 8px 10px",
          border: `1px solid ${focused ? t.color.teal : t.color.border}`,
          borderRadius: t.radius.md,
          background: t.color.surface,
          color: t.color.text,
          fontSize: t.font.sizes.md,
          fontFamily: t.font.sans,
          resize: "vertical",
          outline: "none",
          width: "100%",
        }}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        title="Send (⌘Enter)"
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          borderRadius: t.radius.md,
          cursor: canSend ? "pointer" : "default",
          color: focused || canSend ? t.color.teal : t.color.textFaint,
          transition: "color 0.15s",
        }}
      >
        {sending ? "…" : <Send size={14} />}
      </button>
    </div>
  );
}
