# Validation Issues System

The status bar shows `✕ errors · ⚠ warnings · · infos` at the bottom of the editor.
Clicking a badge opens a drawer with the filtered issue list and a Jump To button.

---

## Architecture: how data flows

```
WorkflowEditorDocument (state.document)
         ↓
   deriveFromDocument()           ← re-runs on every document change
         ↓
   validateAll(doc)               ← returns ValidationIssue[]
         ↓
   DerivedState {
     issues: ValidationIssue[]
     errorCount: number
     warningCount: number
     infoCount: number
   }
         ↓
   ┌──────────────────────────────────────┐
   │  Toolbar  │  Canvas   │  Inspector  │
   │ (badges)  │ (highlights)│ (details) │
   └──────────────────────────────────────┘
```

**Key files:**

| Component | File | Lines |
|-----------|------|-------|
| Types | `workflow-core/src/types/validation.ts` | 1–9 |
| Entry point | `workflow-core/src/validate/index.ts` | 30–32 |
| Semantic rules | `workflow-core/src/validate/semantic.ts` | 52–662 |
| DerivedState computation | `workflow-react/src/state/derive.ts` | 9–33 |
| Badges | `workflow-react/src/toolbar/Toolbar.tsx` | 54–80 |
| Drawer | `workflow-react/src/toolbar/IssuesDrawer.tsx` | 74–270 |
| Integration | `workflow-react/src/components/WorkflowEditor.tsx` | 280–283, 1046–1055 |

---

## Data types

```ts
interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;        // machine-readable, e.g. "unknown-transition-target"
  message: string;     // human-readable description
  targetId?: string;   // UUID of the element to jump to
  detail?: Record<string, unknown>; // additional context
}
```

---

## Severity levels

For the full list of rules see [`workflow-core/src/validate/semantic.ts`](../../../cyoda-workflow-editor/packages/workflow-core/src/validate/semantic.ts).

### ✕ Error — blocks save

The workflow is invalid per spec. The Save button is disabled when `errorCount > 0`.

| Code | Description |
|------|-------------|
| `missing-initial-state` | No initialState defined |
| `unknown-initial-state` | initialState references a non-existent state |
| `duplicate-workflow-name` | Multiple workflows share the same name |
| `unknown-transition-target` | Transition points to a non-existent state |
| `duplicate-transition-name` | Two transitions with the same name in one state |
| `name-regex-violation` | Name does not match the allowed format |
| `function-missing-name` | Function criterion has no name |
| `invalid-jsonpath-subset` | jsonPath is not from the supported subset |
| `criterion-depth-limit` | Criterion nesting exceeds the engine hard limit |
| `simple-between-shape` | BETWEEN requires a `[low, high]` array |

### ⚠ Warning — save allowed, but risks exist

Does not block save; indicates likely bugs or unexpected runtime behaviour.

| Code | Description |
|------|-------------|
| `unreachable-state` | State is unreachable from initialState |
| `null-criterion-not-last` | Automated transition without a criterion is not last — subsequent transitions will never fire |
| `unreachable-automated-transition` | Transition blocked by an earlier null-criterion transition |
| `processor-overload` | More than 5 processors on one transition |
| `excessive-fan-out` | More than 8 outgoing transitions from a state |
| `disabled-transition-on-active-workflow` | Disabled transition in an active workflow |
| `sync-on-likely-bottleneck-transition` | SYNC processor on a transition that may become a bottleneck |
| `criterion-depth-warning` | Deep criterion nesting — hard to read and maintain |
| `unsupported-operator` | Operator not implemented by the engine (will be ignored at runtime) |
| `crossover-without-async-result` | `crossoverToAsyncMs` is set but `asyncResult ≠ true` |

### · Info — informational only, no action needed

| Code | Description |
|------|-------------|
| `workflow-inactive` | Workflow is marked inactive |
| `terminal-state-derived` | State has no outgoing transitions (terminal) |
| `unused-workflow-criterion` | Workflow-level criterion is set but session has only one workflow |

---

## IssuesDrawer

### Opening

Clicking a badge calls `onIssueBadgeClick(severity)` in `WorkflowEditor`.
This toggles `openIssueSeverity` — clicking the same badge again closes the drawer.

```tsx
// WorkflowEditor.tsx, ~1039
onIssueBadgeClick={(severity) =>
  setOpenIssueSeverity((prev) => (prev === severity ? null : severity))
}
```

### Filtering

The drawer shows only issues matching the current severity:
```ts
const filtered = useMemo(
  () => issues.filter((i) => i.severity === severity),
  [issues, severity]
);
```

### Jump To

Each issue has a `targetId` — the UUID of an element in the document.
`resolveTarget(doc, targetId)` looks it up in `doc.meta.ids`:

```
ids.states[targetId]      → { kind: "state", workflow, stateCode, nodeId }
ids.transitions[targetId] → { kind: "transition", workflow, state }
ids.processors[targetId]  → { kind: "processor", workflow, state }
ids.workflows[uuid]       → { kind: "workflow", name }
```

Clicking Jump To:
1. Passes a `Selection` object to `handleSelectionChange()`
2. Canvas highlights the element
3. Inspector opens with element details
4. Switches to the correct workflow tab if needed
5. Drawer closes

### Closing

- Click × in the drawer header
- Press Escape
- Click outside the drawer (except toolbar buttons)
- Click the same badge again

---

## Where validation is used beyond the badges

| Location | Behaviour |
|----------|-----------|
| **Save button** | Disabled when `errorCount > 0` |
| **Canvas** | Issues passed for node/edge highlighting |
| **Inspector** | Shows inline issues for the selected element |
| **JSON Editor** | `saveBlockedByJson` adds an additional block condition |

---

## Adding a new validation rule

1. Open `workflow-core/src/validate/semantic.ts`
2. Add a function:
```ts
function checkMyRule(session: WorkflowSession, issues: ValidationIssue[]): void {
  for (const wf of session.workflows) {
    if (/* condition */) {
      issues.push({
        severity: "warning",
        code: "my-rule-code",
        message: "Description of the problem",
        targetId: someElement.uuid,
      });
    }
  }
}
```
3. Call it inside `validateSemantics()` at the bottom of the file
4. Rebuild `@cyoda/workflow-core` and `@cyoda/workflow-react`
