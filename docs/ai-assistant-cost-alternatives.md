# AI Assistant: Current Implementation & Cost-Reduction Alternatives

This document describes how the embedded AI Assistant ("BYO AI", Track C) currently
talks to LLM providers, who pays for inference, and what alternative approaches
exist if per-token API cost becomes a concern for users.

## 1. Current architecture

```
React UI (assistant/*)
  -> ipc/llm.ts            : invoke("llm_complete", { provider, model, apiKey, body })
  -> src-tauri/commands/llm.rs : reqwest POST to an allowlisted provider endpoint
  -> Provider API (Anthropic / OpenAI / Gemini)
```

The webview's CSP doesn't allow direct outbound requests to provider hosts (and
this also sidesteps per-provider CORS), so every completion is proxied through a
small Rust command in the Tauri backend.

### Key components

| Concern | File |
|---|---|
| Build provider-agnostic request, call IPC | `apps/dev-console/src/assistant/llmClient.ts` |
| Tauri IPC wrapper | `apps/dev-console/src/ipc/llm.ts` |
| Outbound proxy, endpoint allowlist, auth headers | `apps/dev-console/src-tauri/src/commands/llm.rs` |
| Provider abstraction (`LlmProvider` interface) | `apps/dev-console/src/assistant/providers/types.ts` |
| Per-provider request/response mapping | `apps/dev-console/src/assistant/providers/{anthropic,openai,gemini}.ts` |
| Provider/model/key state (Zustand) | `apps/dev-console/src/assistant/keyStore.ts` |
| Setup UI (provider/model/key picker) | `apps/dev-console/src/assistant/AiSetup.tsx` |
| System prompt construction | `apps/dev-console/src/assistant/systemPrompt.ts` |
| Chat loop / tool-call handling | `apps/dev-console/src/assistant/useAssistantChat.ts` |

### Auth & key storage

- **Bring-your-own API key.** The user pastes their own provider API key into
  `AiSetup.tsx`. There is no app-side key, server, or proxy account.
- Keys are kept in `sessionStorage` (origin-scoped, cleared when the window
  closes) — see `keyStore.ts`. A TODO references migrating to the OS keychain via
  `tauri-plugin-keyring`.
- The Rust proxy (`llm.rs`) only knows three providers and maps each to a fixed
  base URL (`provider_base_url`); it attaches the auth header itself
  (`x-api-key` + `anthropic-version` for Anthropic, `Authorization: Bearer` for
  OpenAI, `?key=` query param for Gemini). It is not a general HTTP egress —
  unknown providers/hosts are rejected.

### Providers & models

Defined in `providers/anthropic.ts` (and siblings for OpenAI/Gemini):

- Anthropic models offered: `claude-opus-4-8`, `claude-sonnet-4-6`,
  `claude-haiku-4-5-20251001` — default `claude-sonnet-4-6`.
- Each provider implements `buildRequest()` / `parseResponse()` against a shared
  `ChatMessage` / `ProviderResult` shape.

### Request shape

- **One-shot, non-streaming** completions (`useAssistantChat.ts`'s `send()`).
  Each user message triggers exactly one `complete()` call.
- A single tool, `propose_workflow_update` (`providers/types.ts`), lets the model
  return either free text or a full replacement workflow JSON, validated by
  `applyWorkflow.ts`.
- The **system prompt embeds the entire current workflow import-payload JSON**
  on every turn (`systemPrompt.ts`), so larger workflows mean a larger system
  block on every request.
- `max_tokens` is fixed at `8192` (`MAX_OUTPUT_TOKENS` in `providers/types.ts`).

## 2. Current cost model

- **Who pays:** the end user, directly to the provider, via their own API key.
  The app itself never sees or pays for tokens — this already avoids the classic
  "app owner subsidizes everyone's usage" cost problem.
- **What drives the user's bill:**
  - The full workflow JSON re-sent as part of the `system` prompt on *every*
    turn (no conversation memory beyond re-sending it, no prompt caching).
  - `max_tokens: 8192` is the ceiling per response (Anthropic only bills actual
    output tokens, but large proposed-workflow rewrites can get close to it).
  - No streaming, so there's no way for the user to cancel a response early to
    save output tokens.
  - Default model is Sonnet 4.6 (mid-tier pricing) for all interactions,
    including simple Q&A that a cheaper model could likely handle.

## 3. Alternatives

### 3.1 Prompt caching (low effort, no architecture change)

Anthropic (and OpenAI/Gemini equivalents) support caching parts of a request.
Marking a block with `cache_control` means a turn that repeats that block
*verbatim* pays the cached-read rate (~10% of input price on Anthropic) instead
of full price; a turn that doesn't match pays a small premium (~1.25x for a
5‑minute TTL) to (re)write the cache.

**Important caveat — caching is an exact-prefix match, and the workflow JSON in
our system prompt is *expected* to change between turns:** the assistant must
re-send the current workflow JSON every turn because it can legitimately change
since the last turn — either the user applied the AI's own proposed edit, or
edited the file directly in the editor. So:

- If the workflow JSON is **unchanged** since the previous turn (e.g. the user
  asks a follow-up/clarifying question, or discusses a proposal before applying
  it), the system block matches and that turn gets the ~90% cached-read
  discount.
- If the workflow JSON **changed** since the previous turn (an edit was just
  applied), the prefix no longer matches — that turn is a cache miss/rewrite at
  a slight premium.

So "cut the cost of follow-up messages by ~90%" is true for *some* follow-ups
(unchanged-workflow turns), not all of them — turns immediately after an edit
don't benefit and cost marginally more.

**Better split:** use two cache breakpoints (Anthropic supports up to 4) instead
of one:
1. The **static instructions/rules** portion of the system prompt
   (`systemPrompt.ts`'s `intro`/`Rules` text) — essentially never changes, so it
   gets the cache discount on almost every turn regardless of edits.
2. The **current workflow JSON** — cached/discounted only on the
   unchanged-since-last-turn turns described above.

This gives a guaranteed baseline saving from (1) plus a bonus saving from (2)
during "quiet" multi-turn discussions between edits — a more honest estimate
than a flat 90% on every follow-up.

**Trade-off:** modest implementation work in `providers/anthropic.ts` (and the
Rust proxy passes the body through unchanged, so likely just a request-shape
change); cache TTL/min-token thresholds apply, so very small workflows may not
benefit.

### 3.2 Reduce payload size further

- Send only a diff/summary of the workflow instead of the full JSON on every
  turn, reconstructing the full document client-side before calling
  `applyWorkflow.ts`.
- Trim the static instruction text in `systemPrompt.ts`.

**Trade-off:** more complex prompt/response contract; risk of the model losing
context on large workflows if summarized too aggressively.

### 3.3 Cheaper default / tiered model selection

Default to `claude-haiku-4-5` for plain Q&A (no workflow open, or short
messages) and only use Sonnet/Opus when a workflow edit is requested.

**Trade-off:** heuristics for "which model for this turn" add complexity and can
misfire (e.g., a short message that actually needs a complex edit).

### 3.4 CLI-based invocation (`ant`, Claude Code CLI)

Both are still **the same metered `/v1/messages` API under the hood** — switching
transport from `fetch`/`reqwest` to a CLI subprocess does not change billing at
all. It would also require shelling out from the Tauri backend, which cuts
against the current sandboxed-proxy design (`llm.rs`'s explicit
"NOT a general HTTP egress" comment) and adds a runtime dependency on the CLI
being installed. **Not recommended as a cost lever.**

### 3.5 Subscription-based auth (Claude Pro/Max via OAuth, like Claude Code)

Instead of a metered API key, authenticate the user via the OAuth flow Claude
Code uses against their existing Claude Pro/Max subscription, so usage draws
from the flat-rate plan they may already be paying for rather than per-token API
billing.

**Trade-offs:**
- This OAuth flow is part of Claude Code's own client integration, not a
  documented/supported third-party integration path — it may change without
  notice and could raise ToS questions for a separate desktop app.
- Significant new work: a second auth mode alongside BYO API key, token
  refresh/storage, and provider-adapter changes (the `LlmProvider` interface
  would need an "auth strategy" concept, not just an API key).
- Anthropic-only — OpenAI/Gemini have no equivalent for this app today.

### 3.6 Local / self-hosted models (e.g. Ollama)

A fourth `LlmProvider` targeting a local inference server. Zero marginal
per-token cost to the user.

**Trade-offs:** quality of small local models on the structured
`propose_workflow_update` tool-use task is likely much weaker than Claude/GPT;
requires the user to install and run a local model server; large local resource
(RAM/GPU) requirements.

### 3.7 Anthropic Batch API

Not applicable — the assistant is an interactive, synchronous chat; Batch API is
for asynchronous bulk processing.

### 3.8 Managed Agents

Anthropic's server-managed agent platform is still token-billed via the same
underlying API and adds session/container infrastructure the app doesn't
currently need. Not a cost lever for this use case.

## 4. Summary

| Option | Cost impact | Effort | Architectural change |
|---|---|---|---|
| Prompt caching | Medium–High (full discount on static instructions every turn; ~90% discount on workflow JSON only for turns where it's unchanged since the last turn) | Low | None |
| Trim/diff payload | Medium | Medium | Prompt contract |
| Tiered model selection | Medium | Low–Medium | Heuristic in chat loop |
| CLI (`ant` / Claude Code) | None | Medium | Negative (breaks sandboxed proxy) |
| Subscription OAuth (Pro/Max) | High (flat fee vs. metered) | High | New auth mode, Anthropic-only |
| Local models (Ollama) | Very high (near-zero) | Medium–High | New provider, quality risk |
| Batch API | N/A | — | Not applicable (interactive) |
| Managed Agents | None | High | Not applicable |

**Suggested starting point:** prompt caching (3.1) with the two-breakpoint split
(static instructions always cached, workflow JSON cached only when unchanged
since the last turn) as a near-term, low-risk win on the existing architecture,
with tiered model selection (3.3) as a cheap follow-up. Subscription-based auth
(3.5) is the only option that fundamentally changes the cost model from
metered-per-token to flat-fee, but it's a larger, Anthropic-specific bet that
should be scoped separately.
