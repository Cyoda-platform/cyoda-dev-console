import {
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_PARAMETERS,
  type BuildRequestInput,
  type LlmProvider,
  type ProviderResult,
} from "./types.js";

export const openai: LlmProvider = {
  id: "openai",
  label: "OpenAI",
  models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
  defaultModel: "gpt-4o",

  buildRequest({ system, messages, model }: BuildRequestInput) {
    return {
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
            parameters: TOOL_PARAMETERS,
          },
        },
      ],
    };
  },

  parseResponse(body: unknown): ProviderResult {
    const choice = (body as { choices?: Array<{ message?: Record<string, unknown> }> }).choices?.[0];
    const message = choice?.message;
    if (!message) return {};

    let toolCall: ProviderResult["toolCall"];
    const toolCalls = message.tool_calls as
      | Array<{ function?: { name?: string; arguments?: string } }>
      | undefined;
    const call = toolCalls?.find((c) => c.function?.name === TOOL_NAME);
    if (call?.function?.arguments) {
      try {
        const args = JSON.parse(call.function.arguments) as { workflow_json?: unknown };
        if (typeof args.workflow_json === "string") {
          toolCall = { workflowJson: args.workflow_json };
        }
      } catch {
        // malformed tool arguments — leave toolCall unset
      }
    }

    const text = typeof message.content === "string" ? message.content : undefined;
    return {
      ...(text ? { text } : {}),
      ...(toolCall ? { toolCall } : {}),
    };
  },
};
