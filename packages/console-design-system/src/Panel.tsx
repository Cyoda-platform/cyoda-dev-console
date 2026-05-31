import type { HTMLAttributes, ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

export function Panel({ title, children, ...rest }: HTMLAttributes<HTMLDivElement> & { title?: ReactNode }) {
  const t = useTokens();
  return (
    <div
      {...rest}
      style={{
        background: t.color.surface, border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md, padding: t.space.md,
        ...(rest.style ?? {}),
      }}
    >
      {title != null && (
        <div style={{ fontWeight: 600, fontSize: t.font.sizes.md, marginBottom: t.space.sm }}>{title}</div>
      )}
      {children}
    </div>
  );
}
