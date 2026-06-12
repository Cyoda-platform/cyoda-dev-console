# Claude CLI / MCP Integration for the In-App Assistant — Design Sketch

> **Status: exploration only.** Nothing in this document is implemented. It exists to
> capture a concrete architecture before any of it is built, grounded in the current
> code under `apps/dev-console/src/assistant/` and `apps/dev-console/src/agent/`.

---

## 1. Current state

Two unrelated AI surfaces exist in the Dev Console today.

### 1a. In-app Assistant (`apps/dev-console/src/assistant/`)

- BYO-key: the user pastes an Anthropic/Gemini API key, stored in `sessionStorage`
  via `keyStore.ts`.
- One HTTP call per turn to the provider's Messages API, built by
  `providers/anthropic.ts` / `providers/gemini.ts` (`providers/types.ts` defines the
  shared `LlmProvider` interface).
- Exactly **one** tool: `propose_workflow_update` (`providers/types.ts`). The model
  returns a full replacement workflow JSON, which is diffed (`ProposedChange.tsx`) and
  applied on user confirmation (`applyWorkflow.ts`).
- Per-file chat history persisted in `localStorage` (`useAssistantChat.ts`).
- Surfaced via `AssistantTab.tsx` at the top of `/agent`.

### 1b. "Advanced: external agents" (`apps/dev-console/src/agent/`)

Explicitly **out-of-process**: *"These help you set up a separate command-line AI
agent — Claude Code, Gemini CLI, or Codex — that runs outside this app. They do not
affect the in-app Assistant above."* (`routes/agent.tsx`)

- `ConnectTab.tsx`: `detect_agents` (Rust, `commands/agent.rs`) checks `claude` /
  `gemini` / `codex` on `PATH` via `which` + `--version`; offers to install the
  `cyoda-skills` Claude Code plugin and write a rule file (`CLAUDE.md` / `GEMINI.md` /
  `AGENTS.md`) into the project root.
- `BundleTab.tsx` / `bundle.ts`: assembles a portable `cyoda-agent-task/` directory
  (task brief, rule file, profile instructions, optional `workflow.json` /
  `entity-sample.json`, `MANIFEST.json`) for the user to hand to an externally-run
  agent.
- `ProfilesTab.tsx`: reads `~/.config/cyoda/cyoda-plugin-config.json` — the active
  Cyoda backend endpoint/token consumed by `cyoda-skills`.
- `packages/agent-bridge-contract/src/TrackB.ts` already sketches a
  `TrackBClient.launchAgent(agent, { cwd })` method and an
  `agents.claude-code.install` capability flag, but **no implementation exists yet**.

The "Cyoda tool contract" — `list_workflows`, `get_workflow`, `update_workflow`,
`list_entities`, `get_entity`, `create_entity`, `transition_entity`, `run_report` — is
documented in `templates.ts` (`cyodaBriefBody`) as the operations an external agent is
expected to have, backed by the Cyoda REST API and the active profile from
`cyoda-plugin-config.json`. **No MCP server implementing this contract exists in this
repo** — it's presumably intended to live in `cyoda-skills`.

---

## 2. What "connect the assistant to Claude CLI via MCP" means here

MCP runs in the *opposite* direction from how the in-app Assistant works today:

- **Today**: Dev Console → (HTTP) → Anthropic Messages API. The Dev Console itself is
  the only tool-caller (`propose_workflow_update`).
- **MCP**: Claude Code CLI is the **MCP client**; it calls out to **MCP servers** that
  expose tools. "Connecting via MCP" means standing up an MCP server that exposes the
  Cyoda tool contract, and having `claude` (run either by the user externally, or as a
  subprocess of the Dev Console) call into it.

This splits into three independent tiers.

---

## 3. Tier 1 — Shared Cyoda MCP server (foundation)

A small MCP server (stdio transport) implementing the 8-tool contract already
documented in `templates.ts`:

```
┌────────────────────────────┐
│  cyoda-mcp-server            │  stdio MCP server
│  list_workflows               │  - reads ~/.config/cyoda/cyoda-plugin-config.json
│  get_workflow                 │    for the active profile (endpoint/token/env)
│  update_workflow               │  - workflow read/write ops act on the open
│  list_entities                  │    project's workflow JSON files
│  get_entity                      │  - entity/report ops proxy to the Cyoda REST API
│  create_entity                    │
│  transition_entity                 │
│  run_report                         │
└────────────────────────────┘
        ▲                       ▲
        │ .mcp.json              │ --mcp-config (sidecar)
        │                        │
┌───────┴────────┐      ┌────────┴────────────┐
│ External `claude`│      │ Tier 2: in-app      │
│ CLI (user's       │      │ "Claude Code" mode  │
│ terminal, against  │      │ (Dev Console spawns │
│ cyoda-agent-task/)  │      │  claude as sidecar) │
└─────────────────────┘      └─────────────────────┘
```

Same server, two consumers. It most naturally lives in `cyoda-skills` (already the
authoritative source for skill/plugin content referenced by `ConnectTab`), published
so `ConnectTab`'s "write rule file" step can also write a project-local `.mcp.json`
pointing at it.

This tier alone already answers "can Claude Code use our tools" — independently of any
Dev Console UI changes, and benefits the existing Bundle/Connect flow immediately.

---

## 4. Tier 2 — In-app "Claude Code" engine + live notifications

Add `"claudeCli"` as a third option next to `"anthropic"` / `"gemini"` in
`keyStore.ts` / `providers/index.ts`. When selected, `useAssistantChat.send()` skips
`llmClient.ts` and instead:

```
useAssistantChat.send()
  │
  ├─ ensure a project-local .mcp.json exists, pointing at cyoda-mcp-server
  │  (stdio, cwd = project root, reads the active profile from
  │   ~/.config/cyoda/cyoda-plugin-config.json)
  │
  ├─ invoke("start_claude_cli_session", {
  │      prompt, cwd: projectRoot, mcpConfig: ".mcp.json",
  │      allowedTools: ["mcp__cyoda__*"],
  │    })
  │     │
  │     ▼  (Rust — new commands/claude_session.rs)
  │   tokio::process::Command::new("claude")
  │     .args(["-p", prompt,
  │            "--output-format", "stream-json",
  │            "--mcp-config", ".mcp.json",
  │            "--allowedTools", "mcp__cyoda__*"])
  │     .current_dir(projectRoot)
  │     .stdout(piped)
  │
  ├─ Rust reads stdout line-by-line — each line is one stream-json event
  │  (assistant text deltas, tool_use, tool_result, final result) — and
  │  emit()s a Tauri event `claude-cli:event`, tagged with sessionId
  │
  └─ Frontend subscribes via @tauri-apps/api/event and renders each event
     as it arrives in ChatContent.tsx:
       - text deltas               → assistant message text (streaming)
       - tool_use(list_*, get_*)   → "Reading workflow X…" status chip
       - tool_use(update_workflow) → intercepted, turned into a Proposal
         (current/canonical) and routed through the existing
         ProposedChange.tsx diff/apply flow — NOT applied directly by the CLI
       - result                    → sending = false, session done
```

"Notifications" in this tier *are* the chat panel updating live, turn by turn, with
intermediate tool-call status — no native OS notification is needed since the app is
in the foreground driving the session. `stop_claude_cli_session(sessionId)` kills the
child process for a Cancel button.

**Permissions.** `detect_agents` already gates on `installed: true`; Tier 2 should
additionally pass `--allowedTools mcp__cyoda__*` (plus maybe `Read`) so the spawned
`claude` process cannot run arbitrary `Bash`/`Write` outside the Cyoda tool contract —
consistent with the path-confinement (`resolve_new_inside_root`) already enforced for
`write_project_text_file`.

**Auth.** `claude` needs its own credentials. Default/recommended path: the user runs
`claude login` once on their machine, authenticating with their personal Claude.ai
subscription (Pro/Max). Since the Dev Console spawns `claude` as a subprocess under the
same OS user, it inherits that login automatically (`~/.claude/...`) — no extra wiring
needed. This is **independent** of the BYO API key in `keyStore.ts`, which only feeds
the direct-API providers (`anthropic`/`gemini`); the two credential stores are not
linked and don't need to be. `ANTHROPIC_API_KEY`-based auth remains an option for users
who prefer pay-per-token billing over a subscription, but isn't required.

---

## 5. Tier 3 (optional) — Desktop notifications for out-of-process sessions

For the *existing* "Advanced: external agents" flow — the user runs `claude`
themselves against a `cyoda-agent-task/` bundle — the Dev Console isn't watching at
all. Close that gap without piping all output through the app:

```
ConnectTab's "write rule file" step also offers to write .claude/settings.json
with hooks:

  "hooks": {
    "Stop":         [{ "hooks": [{ "type": "command",
                        "command": "curl -s -X POST http://127.0.0.1:<port>/cyoda-hook -d '{\"event\":\"stop\"}'" }] }],
    "Notification": [{ "hooks": [{ "type": "command",
                        "command": "curl -s -X POST http://127.0.0.1:<port>/cyoda-hook -d '{\"event\":\"notification\"}'" }] }]
  }

Dev Console (Rust, on startup):
  - binds a tiny HTTP listener on 127.0.0.1:<random port>
  - writes the port to a known path under the app's config dir
  - on POST, emits a Tauri event → frontend shows a toast, and — if the
    window is unfocused — a native OS notification via
    tauri-plugin-notification ("Claude Code finished in <project>")
```

Small, additive, and reuses `ConnectTab`'s existing "write a file into the project"
UX. It's the cheapest way to get "notifications in the assistant" for sessions the
user starts in their own terminal.

---

## 6. Tiers 2 and 3 are independent, not alternatives

Tier 2 (in-app chat engine) and Tier 3 (terminal + hook notifications) serve different
workflows and can both ship, either, or neither — they don't compete for the same UI
slot and don't depend on each other (both build on Tier 1).

- **Tier 2** fits quick, in-app questions/edits — the user stays in the Assistant tab.
- **Tier 3** fits heavier sessions where the user already prefers a terminal
  (`cyoda-agent-task/` + their own `claude` invocation) and just wants the Dev Console
  to ping them on completion.

The same user might use both on different days. If scoping down, Tier 3 is the
cheaper, additive option (no new chat engine), but either can be picked independently.

---

## 7. Staging recommendation

| Order | Piece | Why |
|---|---|---|
| 1 | **Tier 1** — Cyoda MCP server | Reusable; unblocks both Tier 2 and external `claude`/`cyoda-skills` users today, independent of Dev Console UI work. |
| 2 | **Tier 3** — hook → local HTTP → OS notification | Small and additive, no new "engine" in the assistant; immediate value for the already-shipped Bundle flow. |
| 3 | **Tier 2** — in-app Claude Code engine | Largest scope: process management, stream-json parsing, permission flags, cancellation, error/timeout handling, auth story. Ships as a new *engine* alongside the existing single-tool provider — the current direct-API path stays the simple default. |

---

## 8. Open questions

- Where does `cyoda-mcp-server` ship from — the `cyoda-skills` repo (consistent with
  the "authoritative skills" framing in `templates.ts`) or a new package in this
  monorepo (`packages/cyoda-mcp-server`)?
- ~~Tier 2 auth: separate `claude login` vs. reusing the BYO key from `keyStore.ts`?~~
  Resolved — see §4: personal `claude login` subscription, inherited by the subprocess,
  kept separate from `keyStore.ts`.
- `--output-format stream-json` event shapes should be pinned against the
  `claude --version` already captured by `detect_agents`, and re-checked on CLI
  upgrades.
- Does `update_workflow` via MCP need the same dry-run-first convention already written
  into the rule-file templates (`cyodaBriefBody` rule 4: *"Prefer `dry_run` first for
  any write tool, then apply once the user approves the diff"*)?
