# Visual Redesign — Design Spec
Date: 2026-06-04
Status: Approved

## Summary

Apply styles and fonts from `Cyoda-platform/ai-assistant-ui` (branch `cyoda-cloud-workbench-ui-3`) to the Dev Console shell. **Style-only change — no layout, no button placement, no functional changes.** The `cyoda-workflow-editor` package (graph editor) is explicitly out of scope.

---

## Typography

| Current | New |
|---------|-----|
| IBM Plex Sans | **Inter** (UI text, labels, buttons, nav) |
| IBM Plex Mono | **JetBrains Mono** (file paths, code, metadata) |

Font sizes and weights follow the reference scale:
- Body: 13–14px / 400
- Labels / small: 11–12px / 500–600
- Button: 12–13px / 600
- Headings: 16–20px / 600–700

---

## Color Tokens

Replace `packages/console-design-system/src/tokens.ts`:

| Token | Old | New | Usage |
|-------|-----|-----|-------|
| `teal` | — | `#0D9488` | Brand, logo, saved-badge, active dot |
| `tealSoft` | — | `#CCFBF1` | Teal-tinted backgrounds |
| `blue` | — | `#2563EB` | Primary actions (Save button, active nav item) |
| `blueHover` | — | `#1D4ED8` | Action hover |
| `blueSoft` | — | `#EFF6FF` | Active nav/file backgrounds |
| `surface` | `#FFFFFF` | `#FFFFFF` | unchanged |
| `surfaceAlt` | `#F4F4F4` | `#F8FAFC` | App shell, sidebar |
| `surfaceMuted` | — | `#F1F5F9` | Subtle panels |
| `border` | `#E0E0E0` | `#E2E8F0` | Default border |
| `borderStrong` | — | `#CBD5E1` | Strong panel border |
| `text` | `#161616` | `#0F172A` | Primary text |
| `textSecondary` | — | `#334155` | Body text |
| `textMuted` | `#525252` | `#64748B` | Muted text |
| `textFaint` | — | `#94A3B8` | Section labels, placeholders |
| `danger` | `#DA1E28` | `#DC2626` | unchanged in spirit |
| `warning` | `#F1C21B` | `#D97706` | unchanged in spirit |
| `success` | `#198038` | `#059669` | unchanged in spirit |
| `cyodaGreen` | `#004235` | removed | replaced by teal |
| `cyodaOrange` | `#F58220` | `#F58220` | kept as-is |

---

## Component Changes

### ThemeProvider / Global CSS
- Load **Inter** from Google Fonts (weights 400, 500, 600, 700)
- Load **JetBrains Mono** from Google Fonts (weights 400, 500)
- Update `font-family` CSS variables

### Header (`packages/console-shell/src/Header.tsx`)
- Background: green `#004235` → white `#FFFFFF`
- Border bottom: `1px solid #E2E8F0`
- Logo text: Inter 700, color `#0D9488`
- Height: keep existing, adjust padding to match Inter metrics
- Project badge: `#F8FAFC` bg, `#E2E8F0` border, JetBrains Mono

### Sidebar
- Background: `#F4F4F4` → `#FFFFFF`
- Border right: `1px solid #E2E8F0`
- Active nav item: `#EFF6FF` bg, `#2563EB` text
- Inactive nav item: `#64748B` text
- Section labels: `#94A3B8`, uppercase, 10px, letter-spacing 0.8px
- Active file: `#EFF6FF` bg, `#2563EB` text, JetBrains Mono
- Inactive file: `#64748B`, JetBrains Mono

### Button (`packages/console-design-system/src/Button.tsx`)
- border-radius: `2px` → `6px`
- Primary: `#2563EB` bg, white text; hover `#1D4ED8`
- Secondary: white bg, `#334155` text, `#E2E8F0` border; hover `#F8FAFC` bg
- Danger: `#DC2626` bg, white text

### Panel (`packages/console-design-system/src/Panel.tsx`)
- border-radius: `2px` → `8px`
- border: `1px solid #E2E8F0`
- background: `#FFFFFF`

### Toolbar (workflow/entity routes)
- Background: white, border-bottom `1px solid #E2E8F0`, height 42px
- File path: JetBrains Mono, `#0F172A`
- Status badge (saved): `#CCFBF1` bg, `#0D9488` text
- Status badge (dirty): `#FEF3C7` bg, `#D97706` text

---

## Out of Scope

- `cyoda-workflow-editor` package — **not touched at all**
- Layout structure, button placement, component hierarchy
- Functionality of any kind
- Dark mode
- The orange `#F58220` brand color (kept as-is)

---

## Files to Change

1. `packages/console-design-system/src/tokens.ts` — new token values
2. `packages/console-design-system/src/ThemeProvider.tsx` — font imports + CSS vars
3. `packages/console-design-system/src/Button.tsx` — border-radius, new color tokens
4. `packages/console-design-system/src/Panel.tsx` — border-radius, border color
5. `packages/console-shell/src/Header.tsx` — white bg, teal logo
6. Sidebar component (wherever sidebar styles live) — white bg, blue active state
7. Toolbar areas in `apps/dev-console/src/routes/workflow.tsx` and `entity.tsx` — badge styles, JetBrains Mono for paths
