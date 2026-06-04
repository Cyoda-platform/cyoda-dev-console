# Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Inter + JetBrains Mono fonts and Teal/Blue/Slate color palette from the Cyoda reference design to the Dev Console shell — style only, no layout or functional changes, no workflow editor changes.

**Architecture:** Update design tokens in `console-design-system`, swap font packages, update the 5 shell components (ThemeProvider, Button, Panel, Header, Sidebar), then fix the two inline-styled toolbars in the app routes.

**Tech Stack:** React, TypeScript, `@fontsource/*` packages, CSS-in-JS via inline styles + tokens

---

## Task 1: Install font packages and update tokens

**Files:**
- Modify: `packages/console-design-system/package.json`
- Modify: `packages/console-design-system/src/tokens.ts`

- [ ] **Step 1: Install Inter and JetBrains Mono, remove IBM Plex packages**

```bash
cd packages/console-design-system
pnpm remove @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
pnpm add @fontsource/inter@^5 @fontsource/jetbrains-mono@^5
```

- [ ] **Step 2: Replace tokens.ts**

```ts
// packages/console-design-system/src/tokens.ts
export const tokens = {
  color: {
    // Brand
    teal: "#0D9488",
    tealSoft: "#CCFBF1",
    // Primary actions
    blue: "#2563EB",
    blueHover: "#1D4ED8",
    blueSoft: "#EFF6FF",
    // Surfaces
    surface: "#FFFFFF",
    surfaceAlt: "#F8FAFC",
    surfaceMuted: "#F1F5F9",
    // Borders
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    // Text
    text: "#0F172A",
    textSecondary: "#334155",
    textMuted: "#64748B",
    textFaint: "#94A3B8",
    // Semantic
    danger: "#DC2626",
    warning: "#D97706",
    success: "#059669",
    // Brand orange (kept)
    cyodaOrange: "#F58220",
  },
  radius: { sm: "4px", md: "6px", lg: "8px" },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
  font: {
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    sizes: { sm: "12px", md: "13px", lg: "15px", xl: "20px" },
    weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  },
} as const;

export type DesignTokens = typeof tokens;
```

- [ ] **Step 3: Check TypeScript compiles (no errors expected)**

```bash
cd packages/console-design-system
pnpm typecheck 2>&1 | head -20
```

Expected: any errors will be about removed `cyodaGreen` token — we'll fix those in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add packages/console-design-system/package.json packages/console-design-system/src/tokens.ts
git commit -m "feat(design): replace IBM Plex with Inter/JetBrains Mono, update color tokens"
```

---

## Task 2: Update ThemeProvider font imports

**Files:**
- Modify: `packages/console-design-system/src/ThemeProvider.tsx`

- [ ] **Step 1: Replace font imports and update body styles**

```tsx
// packages/console-design-system/src/ThemeProvider.tsx
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { createContext, useContext, type ReactNode } from "react";
import { tokens, type DesignTokens } from "./tokens";

const ThemeContext = createContext<DesignTokens>(tokens);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={tokens}>
      <div
        style={{
          fontFamily: tokens.font.sans,
          color: tokens.color.text,
          background: tokens.color.surfaceAlt,
          height: "100%",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTokens(): DesignTokens {
  return useContext(ThemeContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-design-system/src/ThemeProvider.tsx
git commit -m "feat(design): update ThemeProvider for Inter font and slate background"
```

---

## Task 3: Update Button component

**Files:**
- Modify: `packages/console-design-system/src/Button.tsx`

- [ ] **Step 1: Update Button to use new tokens**

```tsx
// packages/console-design-system/src/Button.tsx
import type { ButtonHTMLAttributes } from "react";
import { useTokens } from "./ThemeProvider";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  variant = "primary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const t = useTokens();

  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      background: t.color.blue,
      color: "#FFFFFF",
      border: "none",
    },
    secondary: {
      background: t.color.surface,
      color: t.color.textSecondary,
      border: `1px solid ${t.color.border}`,
    },
    danger: {
      background: t.color.danger,
      color: "#FFFFFF",
      border: "none",
    },
  };

  return (
    <button
      {...rest}
      style={{
        ...styles[variant],
        padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.md,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.md,
        fontWeight: t.font.weights.semibold,
        cursor: "pointer",
        ...(rest.style ?? {}),
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-design-system/src/Button.tsx
git commit -m "feat(design): update Button colors and border-radius"
```

---

## Task 4: Update Panel component

**Files:**
- Modify: `packages/console-design-system/src/Panel.tsx`

- [ ] **Step 1: Update Panel border-radius and border color**

```tsx
// packages/console-design-system/src/Panel.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-design-system/src/Panel.tsx
git commit -m "feat(design): update Panel border-radius to 8px"
```

---

## Task 5: Update Header component

**Files:**
- Modify: `packages/console-shell/src/Header.tsx`

- [ ] **Step 1: Update Header — white bg, teal logo**

```tsx
// packages/console-shell/src/Header.tsx
import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const t = useTokens();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${t.space.md}`,
        height: 48,
        flexShrink: 0,
        background: t.color.surface,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      <strong
        style={{
          fontFamily: t.font.sans,
          fontWeight: t.font.weights.bold,
          fontSize: t.font.sizes.lg,
          color: t.color.teal,
          letterSpacing: "-0.3px",
        }}
      >
        {title}
      </strong>
      <div>{right}</div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-shell/src/Header.tsx
git commit -m "feat(design): Header white background with teal logo"
```

---

## Task 6: Update Sidebar component

**Files:**
- Modify: `packages/console-shell/src/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar — white bg, blue active state**

```tsx
// packages/console-shell/src/Sidebar.tsx
import type { ReactNode } from "react";
import { useTokens } from "@cyoda/console-design-system";

export type NavItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  active?: boolean;
};

export function Sidebar({ navItems }: { navItems: NavItem[] }) {
  const t = useTokens();
  return (
    <nav
      style={{
        background: t.color.surface,
        borderRight: `1px solid ${t.color.border}`,
        padding: t.space.sm,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {navItems.map((n) => (
        <button
          key={n.id}
          onClick={n.onSelect}
          style={{
            display: "flex",
            alignItems: "center",
            gap: t.space.sm,
            width: "100%",
            textAlign: "left",
            padding: `${t.space.sm} ${t.space.sm}`,
            borderRadius: t.radius.md,
            background: n.active ? t.color.blueSoft : "transparent",
            color: n.active ? t.color.blue : t.color.textMuted,
            fontWeight: n.active ? t.font.weights.medium : t.font.weights.normal,
            fontFamily: t.font.sans,
            fontSize: t.font.sizes.md,
            border: "none",
            cursor: "pointer",
          }}
        >
          {n.icon} {n.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-shell/src/Sidebar.tsx
git commit -m "feat(design): Sidebar white background with blue active state"
```

---

## Task 7: Fix inline styles in WorkflowRoute toolbar

**Files:**
- Modify: `apps/dev-console/src/routes/workflow.tsx`

The toolbar uses a `toolbarBtn` const with hardcoded IBM Plex Mono, `#E0E0E0` border, `#525252` text, and `borderRadius: 2`. Also the AI button uses `#004235` active color.

- [ ] **Step 1: Update toolbarBtn const and AI button active color**

Find this block (around line 23):
```ts
const toolbarBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid #E0E0E0",
  borderRadius: 2,
  cursor: "pointer",
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontSize: 12,
  color: "#525252",
  padding: "2px 8px",
};
```

Replace with:
```ts
const toolbarBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B",
  padding: "4px 10px",
};
```

- [ ] **Step 2: Fix AI button active color** (around line 218)

Find:
```tsx
? { ...toolbarBtn, background: "#004235", color: "#fff", borderColor: "#004235" }
```

Replace with:
```tsx
? { ...toolbarBtn, background: "#0D9488", color: "#fff", borderColor: "#0D9488" }
```

- [ ] **Step 3: Fix "Unsaved" indicator** (around line 188-189)

Find:
```tsx
<span style={{ color: "#F58220", flexShrink: 0 }}>● Unsaved</span>
```

Replace with:
```tsx
<span style={{ color: "#D97706", flexShrink: 0 }}>● Unsaved</span>
```

- [ ] **Step 4: Fix file path font** (around line 176-177)

Find:
```tsx
fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
```

Replace with (both occurrences in the file):
```tsx
fontFamily: "'JetBrains Mono', ui-monospace, monospace",
```

- [ ] **Step 5: Commit**

```bash
git add apps/dev-console/src/routes/workflow.tsx
git commit -m "feat(design): update WorkflowRoute toolbar to Inter/Teal palette"
```

---

## Task 8: Fix inline styles in EntityRoute toolbar

**Files:**
- Modify: `apps/dev-console/src/routes/entity.tsx`

The entity route also has `toolbarBtn` with similar hardcoded values, plus references to `t.font.mono` (now JetBrains Mono via tokens) and `t.color.cyodaOrange`.

- [ ] **Step 1: Find and update toolbarBtn in entity.tsx**

Search for `toolbarBtn` definition in `apps/dev-console/src/routes/entity.tsx` and update it to match workflow.tsx:

```ts
const toolbarBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B",
  padding: "4px 10px",
};
```

- [ ] **Step 2: Check for any remaining `cyodaGreen` references across the app**

```bash
grep -rn "cyodaGreen\|#004235\|IBM Plex\|ibm-plex" apps/dev-console/src/ --include="*.tsx" --include="*.ts"
```

Fix any remaining occurrences — replace `cyodaGreen` → `teal`, `#004235` → `#0D9488`, `IBM Plex` → `Inter`/`JetBrains Mono`.

- [ ] **Step 3: Commit**

```bash
git add apps/dev-console/src/routes/entity.tsx
git commit -m "feat(design): update EntityRoute toolbar to Inter/Teal palette"
```

---

## Task 9: Build packages and verify

**Files:** none (build + smoke check)

- [ ] **Step 1: Rebuild design-system and console-shell**

```bash
pnpm --filter @cyoda/console-design-system build 2>&1 | tail -5
pnpm --filter @cyoda/console-shell build 2>&1 | tail -5
```

Expected: both build with no errors.

- [ ] **Step 2: Run typecheck across the app**

```bash
pnpm --filter dev-console typecheck 2>&1 | head -30
```

Expected: no errors referencing `cyodaGreen` or missing tokens.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter "./**" test 2>&1 | tail -20
```

Expected: all tests pass (or only pre-existing failures).

- [ ] **Step 4: Start the app and visually verify**

```bash
pnpm --filter dev-console tauri:dev
```

Check:
- Header is white with teal "Cyoda Dev Console" text
- Sidebar is white with blue active nav item
- Buttons are blue (primary) / white with border (secondary)
- Font is Inter throughout
- File paths use JetBrains Mono

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(design): visual redesign complete — Inter + Teal/Blue palette"
```
