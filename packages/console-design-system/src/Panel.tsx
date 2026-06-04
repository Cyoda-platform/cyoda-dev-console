import type { HTMLAttributes, ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

export function Panel({
  title,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { title?: ReactNode }) {
  const t = useTokens();
  return (
    <div
      {...rest}
      style={{
        background: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.lg,
        padding: t.space.md,
        ...(rest.style ?? {}),
      }}
    >
      {title != null && (
        <div
          style={{
            fontWeight: t.font.weights.semibold,
            fontSize: t.font.sizes.md,
            color: t.color.text,
            marginBottom: t.space.sm,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
