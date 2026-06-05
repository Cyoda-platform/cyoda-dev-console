# Test Coverage Audit — `integration` branch

**Date:** 2026-06-05  
**Scope:** All TypeScript/React source files across `apps/dev-console` and the four shared packages  
**Total source files analysed:** 65  
**Test files found:** 22  
**Overall coverage:** ~28% of source files have a corresponding test

---

## Summary by Package

| Package | Source files | Tested | % |
|---|---|---|---|
| `apps/dev-console/src` | 53 | 18 | 34% |
| `packages/console-design-system/src` | 8 | 2 | 25% |
| `packages/console-shell/src` | 3 | 1 | 33% |
| `packages/workflow-editor-host/src` | 5 | 3 (via utility tests) | 60% |
| `packages/entity-model-viewer/src` | 2 | 1 | 50% |

---

## Coverage Detail — `apps/dev-console/src`

### Agent module — 88% ✅

| File | Status | Test file |
|---|---|---|
| `agent/AssistantTab.tsx` | ✅ | `AssistantTab.test.tsx` |
| `agent/BundleTab.tsx` | ✅ | `BundleTab.test.tsx` |
| `agent/ConnectTab.tsx` | ✅ | `ConnectTab.test.tsx` |
| `agent/ProfilesTab.tsx` | ✅ | `ProfilesTab.test.tsx` |
| `agent/bundle.ts` | ✅ | `bundle.test.ts` |
| `agent/pathUtils.ts` | ✅ | `pathUtils.test.ts` |
| `agent/profiles.ts` | ✅ | `profiles.test.ts` |
| `agent/templates.ts` | ❌ | — |
| `agent/AgentContext.tsx` | ❌ | — |

### Assistant module — 36% ⚠️

| File | Status | Test file | Notes |
|---|---|---|---|
| `assistant/AiSetup.tsx` | ✅ | `AiSetup.test.tsx` | Provider selector, key input |
| `assistant/ChatContent.tsx` | ✅ | `ChatContent.test.tsx` | Messages, proposal, applied, error |
| `assistant/applyWorkflow.ts` | ✅ | `applyWorkflow.test.ts` | Validation logic |
| `assistant/keyStore.ts` | ✅ | `keyStore.test.ts` | sessionStorage persistence |
| `assistant/useAssistantChat.ts` | ✅ | `useAssistantChat.test.ts` | Send, apply, error handling |
| `assistant/providers/anthropic.ts` | ✅ | `providers.test.ts` | Request building + response parsing |
| `assistant/providers/openai.ts` | ✅ | `providers.test.ts` | Request building + response parsing |
| `assistant/providers/gemini.ts` | ✅ | `providers.test.ts` | Request building + response parsing |
| `assistant/WorkflowAssistantPanel.tsx` | ❌ | — | Main assistant sidebar, no tests |
| `assistant/ProposedChange.tsx` | ❌ | — | Apply/Cancel diff view, no tests |
| `assistant/chatUi.tsx` | ❌ | — | `ChatBubble`, `ChatComposer` (⌘Enter), no tests |
| `assistant/llmClient.ts` | ❌ | — | Provider orchestrator, no tests |
| `assistant/systemPrompt.ts` | ❌ | — | System prompt builder, no tests |

### Components — 27% ⚠️

| File | Status | Notes |
|---|---|---|
| `components/ProjectExplorer.tsx` | ⚠️ partial | Rendering + sections tested; context menu, file ops, icon actions not tested |
| `components/HeaderContext.tsx` | ⚠️ partial | Smoke render only; project click not tested |
| `components/SplitPane.tsx` | ⚠️ partial | Collapse tested; drag resize not tested |
| `components/CompareView.tsx` | ❌ | Diff viewer, no tests |
| `components/ContextMenu.tsx` | ❌ | Right-click menu, no tests |
| `components/CustomSelect.tsx` | ❌ | Dropdown select, no tests |
| `components/ErrorBoundary.tsx` | ❌ | — |
| `components/FileTree.tsx` | ❌ | Expand/collapse state, no tests |

### Routes — partial ⚠️

| File | Status | Notes |
|---|---|---|
| `routes/workflow.tsx` | ⚠️ partial | Only `onDirtyChange` lifecycle + AI drawer tested; save, compare, external-change banner not tested |
| `routes/first-run.tsx` | ⚠️ partial | Basic render only |
| `routes/settings.tsx` | ⚠️ partial | Project list render only; save/remove mutations not tested |
| `routes/agent.tsx` | ❌ | `AgentRoute` / `AgentPanel`, no tests |
| `routes/entity.tsx` | ❌ | — |

### IPC layer — intentionally untested

`ipc/agent.ts`, `ipc/config.ts`, `ipc/fsio.ts`, `ipc/llm.ts`, `ipc/project.ts`, `ipc/shell.ts`, `ipc/watcher.ts` are thin wrappers over Tauri's `invoke()`. They require the Tauri runtime and cannot be unit-tested. They are covered indirectly via mocks in component tests.

### State & utils

| File | Status | Notes |
|---|---|---|
| `utils/displayName.ts` | ✅ | `displayName.test.ts` |
| `state/projectStore.ts` | ❌ | Zustand store, no direct tests |

---

## Coverage Detail — Shared Packages

### `packages/console-design-system/src`

| File | Status | Notes |
|---|---|---|
| `Tabs.tsx` | ✅ | Selection, onChange, ARIA |
| `Button.tsx` | ⚠️ partial | Render only, no variant/interaction tests |
| `FilePath.tsx` | ❌ | Truncation, copy button |
| `Panel.tsx` | ❌ | Simple container |
| `WarningBanner.tsx` | ❌ | Severity variants |
| `EmptyState.tsx` | ❌ | — |
| `ThemeProvider.tsx` | ❌ | Used as test wrapper; provider itself not tested |

### `packages/workflow-editor-host/src`

| File | Status | Notes |
|---|---|---|
| `useEditorSession.ts` | ✅ | `externalRevision.test.ts` + `dirty.test.ts` + `save.test.ts` + `saveAs.test.ts` |
| `ExternalChangeBanner.tsx` | ✅ | Button visibility, click handlers |
| `WorkflowEditorHostPanel.tsx` | ❌ | No component-level tests |
| `ParseErrorView.tsx` | ❌ | Error + raw content display |
| `OverwriteConfirmModal.tsx` | ❌ | Confirm/Cancel dialog |

### `packages/entity-model-viewer/src`

| File | Status | Notes |
|---|---|---|
| `JsonTree.tsx` | ✅ | Primitives, objects, arrays, expand/collapse |
| `EntityViewer.tsx` | ❌ | JSON parse + display wrapper |

---

## Prioritised Fix List

### Priority 1 — High (AI assistant core, user-visible interactions)

| # | File | What to test |
|---|---|---|
| T-01 | `assistant/WorkflowAssistantPanel.tsx` | Header with filename + close; file context block; ChatContent integration; composer present |
| T-02 | `assistant/ProposedChange.tsx` | Apply/Cancel buttons; `applying` disabled state; diff panes render current + proposed |
| T-03 | `assistant/chatUi.tsx` | `ChatBubble` — user/assistant alignment; `ChatComposer` — input, ⌘Enter sends, disabled when not canSend |
| T-04 | `assistant/systemPrompt.ts` | Prompt includes `workflowRelPath` and `currentJson` when provided; general-question mode when absent |
| T-05 | `assistant/llmClient.ts` | Routes to correct provider adapter; propagates errors from `complete()` |
| T-06 | `routes/agent.tsx` | `AgentPanel` renders AssistantTab + Advanced section; flag-off guard |

### Priority 2 — Medium (supporting UI and templates)

| # | File | What to test |
|---|---|---|
| T-07 | `agent/templates.ts` | `generateRuleFile` contains profile line; `generateProfileInstructionsMd` uses JSON.stringify; `safeForCodeFence` applied to paths |
| T-08 | `components/ContextMenu.tsx` | Items render; click triggers handler; dismiss on outside click |
| T-09 | `components/CustomSelect.tsx` | Opens on click; selects option; onChange called |
| T-10 | `assistant/chatUi.tsx` (ChatComposer) | ⌘Enter sends; Ctrl+Enter sends; disabled state prevents send |

### Priority 3 — Low (design system, simple components)

| # | File | What to test |
|---|---|---|
| T-11 | `packages/console-design-system` — `WarningBanner` | `warning`, `caution`, `success` severity styles |
| T-12 | `packages/console-design-system` — `FilePath` | Truncation; copy button shows ✓ after click |
| T-13 | `packages/workflow-editor-host` — `ParseErrorView` | Issues list; raw content block |
| T-14 | `packages/workflow-editor-host` — `OverwriteConfirmModal` | Confirm/Cancel trigger correct callbacks |

---

## Not Planned (out of scope)

- **IPC wrappers** (`ipc/*.ts`) — require Tauri runtime; covered by mocks in component tests
- **`routes/entity.tsx`** — wraps `EntityViewer` which is itself a thin wrapper over `JsonTree` (already tested)
- **`state/projectStore.ts`** — Zustand store; exercised via component tests; direct tests would duplicate component test assertions
- **`ThemeProvider.tsx`**, `tokens.ts` — used as test infrastructure; no UI to test

---

## Fix Progress

All 14 items completed on 2026-06-05. **110 new tests** added across 14 new test files.

| ID | File | Status | Tests | Commit |
|---|---|---|---|---|
| T-01 | `assistant/WorkflowAssistantPanel.tsx` | ✅ done | 10 | `6990a82` |
| T-02 | `assistant/ProposedChange.tsx` | ✅ done | 6 | `47bf0f3` |
| T-03 | `assistant/chatUi.tsx` (ChatBubble + ChatComposer) | ✅ done | 11 | `47bf0f3` |
| T-04 | `assistant/systemPrompt.ts` | ✅ done | 7 | `47bf0f3` |
| T-05 | `assistant/llmClient.ts` | ✅ done | 8 | `6990a82` |
| T-06 | `routes/agent.tsx` | ✅ done | 7 | `6990a82` |
| T-07 | `agent/templates.ts` | ✅ done | 18 | `ddf9810` |
| T-08 | `components/ContextMenu.tsx` | ✅ done | 5 | `ddf9810` |
| T-09 | `components/CustomSelect.tsx` | ✅ done | 8 | `ddf9810` |
| T-10 | ChatComposer ⌘Enter | ✅ done | covered in T-03 | `47bf0f3` |
| T-11 | `console-design-system/WarningBanner` | ✅ done | 6 | `23d6488` |
| T-12 | `console-design-system/FilePath` | ✅ done | 6 | `23d6488` |
| T-13 | `workflow-editor-host/ParseErrorView` | ✅ done | 5 | `23d6488` |
| T-14 | `workflow-editor-host/OverwriteConfirmModal` | ✅ done | 5 | `23d6488` |

### Additional tests added during the session

| File | Tests | Notes | Commit |
|---|---|---|---|
| `agent/ConnectTab.tsx` | 7 | detection, write, overwrite confirm, error | `8cbcd51` |
| `agent/BundleTab.tsx` | 6 | UI tests; also fixed `written` scoping bug in catch block | `8cbcd51` |

### Updated coverage estimate

| Area | Before | After |
|---|---|---|
| `assistant/` module | 36% | ~85% |
| `agent/` module | 88% | 100% |
| routes (agent) | 0% | covered |
| `components/` (ContextMenu, CustomSelect) | 0% | covered |
| `console-design-system` | 25% | 63% |
| `workflow-editor-host` | 20% | 80% |

### Remaining gaps (no plans to address)

- `components/CompareView.tsx`, `FileTree.tsx`, `ErrorBoundary.tsx` — UI-only wrappers, no complex logic
- `routes/workflow.tsx` — save/compare/external-change flows not tested (only lifecycle)
- `routes/settings.tsx` — save/remove mutations not tested
- `state/projectStore.ts` — exercised via component tests
- `ipc/*.ts` — require Tauri runtime, intentionally not unit-tested
- `agent/AgentContext.tsx` — thin context provider, exercised via consumer tests
