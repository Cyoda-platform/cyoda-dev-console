import { invoke } from "@tauri-apps/api/core";

export interface LlmHttpResponse {
  status: number;
  body: unknown;
}

/**
 * Proxy a single LLM completion through the Rust backend (avoids CSP/CORS; keeps the key
 * out of any external request the webview makes). `body` is the provider-native request
 * JSON, built by the provider adapter. `model` is only used to build the Gemini URL.
 */
export function llmComplete(
  provider: string,
  model: string,
  apiKey: string,
  body: unknown,
): Promise<LlmHttpResponse> {
  return invoke<LlmHttpResponse>("llm_complete", { provider, model, apiKey, body });
}
