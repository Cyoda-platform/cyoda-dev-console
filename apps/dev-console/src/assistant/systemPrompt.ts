import type { SystemPrompt } from "./providers/types.js";

/**
 * Build the system prompt. With a workflow open (`currentJson` present) the assistant can
 * propose edits via the tool; without one it acts as a general Cyoda workflow assistant and
 * asks the user to open a workflow before requesting changes.
 *
 * Returned as `{ static, dynamic? }`: `static` is identical across every turn of a chat (the
 * Anthropic provider marks it as a cache breakpoint), while `dynamic` carries the current
 * workflow JSON, which changes whenever the workflow is edited.
 */
export function buildSystemPrompt(args: { workflowRelPath?: string; currentJson?: string }): SystemPrompt {
  const intro = [
    "You are an assistant embedded in the Cyoda Dev Console. You help the developer work with",
    "Cyoda workflow definitions — import payloads shaped like",
    '`{ "importMode": "MERGE" | "REPLACE", "workflows": [ ... ] }`.',
    "",
    "Cyoda workflows model an entity moving through named states via transitions; processors",
    "and criteria attach to transitions.",
  ];

  if (!args.currentJson) {
    return {
      static: [
        ...intro,
        "",
        "No workflow file is currently open. Answer questions about Cyoda workflows in plain text.",
        "If the user asks you to create or modify a workflow, tell them to open a workflow file in",
        "the editor first so you can propose and apply concrete edits. Do not call any tool yet.",
      ].join("\n"),
    };
  }

  return {
    static: [
      ...intro,
      "",
      "Rules:",
      "- To change the workflow, call the `propose_workflow_update` tool with `workflow_json` set",
      "  to the COMPLETE updated import payload as a JSON string — never a diff or fragment.",
      "- Preserve everything the user did not ask to change.",
      "- The tool argument must be valid JSON.",
      "- If the user only asks a question, answer in text and do not call the tool.",
    ].join("\n"),
    dynamic: [
      args.workflowRelPath ? `Current file: ${args.workflowRelPath}` : "Current file: (unsaved)",
      "Current workflow JSON:",
      "```json",
      args.currentJson,
      "```",
    ].join("\n"),
  };
}
