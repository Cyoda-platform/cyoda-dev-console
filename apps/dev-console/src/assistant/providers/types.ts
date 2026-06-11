export type ProviderId = "anthropic" | "openai" | "gemini";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Present when this message records an AI-applied workflow change (for history rendering). */
  appliedProposal?: { current: string; canonical: string };
}

/** Normalised result of one completion: free text and/or a single workflow-update proposal. */
export interface ProviderResult {
  text?: string;
  toolCall?: { workflowJson: string };
}

/**
 * System prompt split into a static portion (identical across all turns of a chat — safe to
 * cache long-term) and an optional dynamic portion (e.g. the current workflow JSON, which
 * changes whenever the workflow is edited and is only cache-hit while unchanged).
 */
export interface SystemPrompt {
  static: string;
  dynamic?: string;
}

/** Flatten a {@link SystemPrompt} for providers without segmented cache_control support. */
export function joinSystemPrompt(system: SystemPrompt): string {
  return system.dynamic ? `${system.static}\n\n${system.dynamic}` : system.static;
}

export interface BuildRequestInput {
  system: SystemPrompt;
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
