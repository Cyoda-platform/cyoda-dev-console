import {
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_PARAMETERS,
  joinSystemPrompt,
  type BuildRequestInput,
  type LlmProvider,
  type ProviderResult,
} from "./types.js";

export const gemini: LlmProvider = {
  id: "gemini",
  label: "Google Gemini",
  // Verified current via Gemini model list (June 2026). Update as the API evolves.
  models: ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  defaultModel: "gemini-2.5-flash",

  // Model is carried in the request URL (see the Rust proxy), not the body.
  buildRequest({ system, messages }: BuildRequestInput) {
    return {
      system_instruction: { parts: [{ text: joinSystemPrompt(system) }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      tools: [
        {
          function_declarations: [
            {
              name: TOOL_NAME,
              description: TOOL_DESCRIPTION,
              parameters: TOOL_PARAMETERS,
            },
          ],
        },
      ],
    };
  },

  parseResponse(body: unknown): ProviderResult {
    const parts = (
      body as { candidates?: Array<{ content?: { parts?: unknown } }> }
    ).candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return {};

    const texts: string[] = [];
    let toolCall: ProviderResult["toolCall"];
    for (const part of parts as Array<Record<string, unknown>>) {
      if (typeof part.text === "string") {
        texts.push(part.text);
      }
      const fc = part.functionCall as { name?: string; args?: { workflow_json?: unknown } } | undefined;
      if (fc?.name === TOOL_NAME && typeof fc.args?.workflow_json === "string") {
        toolCall = { workflowJson: fc.args.workflow_json };
      }
    }
    return {
      ...(texts.length ? { text: texts.join("\n") } : {}),
      ...(toolCall ? { toolCall } : {}),
    };
  },
};
