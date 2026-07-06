/**
 * Server-level `instructions` returned from the MCP `initialize` handshake.
 *
 * Loaded once into the model's context at session start (Claude Code truncates
 * at 2 KB) and used by tool-search to decide when to reach for this server, so
 * it must stay concise and put the highest-value rules first. It carries the
 * cross-tool "operational model"; per-tool specifics live in each tool's
 * `description`, and the exhaustive reference lives in the README.
 */
export const SERVER_INSTRUCTIONS = `model-editor edits Cyoda workflow/entity model files and serves the live graph editor to a browser. Claude owns file content; the browser is read-only for content and human-owned for layout. show_workflow/show_entity make the browser display an item; optimize_layout tidies node positions after structural edits.

For a single change prefer the atomic, fail-closed element tools — update_transition/add_transition/remove_transition, add_state/remove_state/rename_state — over whole-document update_workflow: each validates the whole document and writes nothing on error, so never stage an invalid intermediate. Create a state before adding transitions into it. rename_state cascades every next-ref, initialState, lifecycle state-criterion, and the saved layout position.

Address a transition by (workflow, state, name), a state by (workflow, code). configure_project sets the session-only workflow/entity globs.`;
