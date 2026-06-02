export type ProviderId = "anthropic" | "openai" | "gemini";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Normalised result of one completion: free text and/or a single workflow-update proposal. */
export interface ProviderResult {
  text?: string;
  toolCall?: { workflowJson: string };
}

export interface BuildRequestInput {
  system: string;
  messages: ChatMessage[];
  model: string;
}

export interface LlmProvider {
  id: ProviderId;
  label: string;
  models: string[];
  defaultModel: string;
  /** Build the provider-native request body sent (via the Rust proxy) to the provider. */
  buildRequest(input: BuildRequestInput): unknown;
  /** Normalise the provider-native response body into a {@link ProviderResult}. */
  parseResponse(body: unknown): ProviderResult;
}

/** The single tool the assistant may call in this slice. */
export const TOOL_NAME = "propose_workflow_update";
export const TOOL_DESCRIPTION =
  "Propose a complete replacement for the workflow import-payload JSON. " +
  "Provide the entire updated document as a JSON string, not a diff or partial fragment.";

/** JSON-schema for the tool's single argument, shared across providers. */
export const TOOL_PARAMETERS = {
  type: "object",
  properties: {
    workflow_json: {
      type: "string",
      description: "The complete updated workflow import-payload JSON, as a string.",
    },
  },
  required: ["workflow_json"],
} as const;

export const MAX_OUTPUT_TOKENS = 8192;
