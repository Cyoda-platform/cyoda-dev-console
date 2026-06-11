import {
  MAX_OUTPUT_TOKENS,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_PARAMETERS,
  type BuildRequestInput,
  type LlmProvider,
  type ProviderResult,
} from "./types.js";

export const anthropic: LlmProvider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  defaultModel: "claude-sonnet-4-6",

  buildRequest({ system, messages, model }: BuildRequestInput) {
    // Two cache breakpoints: the static instructions (rarely change, so they're a cache hit on
    // almost every turn) and the dynamic workflow JSON (a cache hit only on turns where the
    // workflow hasn't changed since the previous turn — see docs/ai-assistant-cost-alternatives.md).
    const systemBlocks: Array<{ type: "text"; text: string; cache_control: { type: "ephemeral" } }> = [
      { type: "text", text: system.static, cache_control: { type: "ephemeral" } },
    ];
    if (system.dynamic) {
      systemBlocks.push({ type: "text", text: system.dynamic, cache_control: { type: "ephemeral" } });
    }
    return {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemBlocks,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [
        {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          input_schema: TOOL_PARAMETERS,
        },
      ],
    };
  },

  parseResponse(body: unknown): ProviderResult {
    const content = (body as { content?: unknown }).content;
    if (!Array.isArray(content)) return {};
    const texts: string[] = [];
    let toolCall: ProviderResult["toolCall"];
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "text" && typeof block.text === "string") {
        texts.push(block.text);
      } else if (block.type === "tool_use" && block.name === TOOL_NAME) {
        const input = block.input as { workflow_json?: unknown } | undefined;
        if (input && typeof input.workflow_json === "string") {
          toolCall = { workflowJson: input.workflow_json };
        }
      }
    }
    return {
      ...(texts.length ? { text: texts.join("\n") } : {}),
      ...(toolCall ? { toolCall } : {}),
    };
  },
};
