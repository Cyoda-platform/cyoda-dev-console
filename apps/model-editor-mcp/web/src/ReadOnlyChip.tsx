import { useTokens } from "@cyoda/console-design-system";

/**
 * Quiet, non-blocking indicator that the content shown here is Claude-owned — read-only in the
 * browser (there is no save/write path for content anywhere in this app; see `EditorView`'s
 * `io.write`). Per the expansion spec's ergonomics section: "Read-only status is a quiet chip,
 * not a banner." Deliberately NOT `ExternalChangeBanner` (@cyoda/workflow-editor-host, which
 * only appears on an actual dirty-vs-pushed clash): this chip is always-on ambient context, not
 * an alert, and must never block or clutter the canvas.
 */
export function ReadOnlyChip() {
  const t = useTokens();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        gap: 4,
        margin: "0 8px",
        padding: "2px 8px",
        borderRadius: 999,
        background: t.color.surfaceMuted,
        color: t.color.textMuted,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
        whiteSpace: "nowrap",
      }}
    >
      Viewing — Claude owns content
    </span>
  );
}
