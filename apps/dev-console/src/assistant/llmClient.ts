import { llmComplete } from "../ipc/llm.js";
import {
  getProvider,
  type ChatMessage,
  type ProviderId,
  type ProviderResult,
  type SystemPrompt,
} from "./providers/index.js";

export interface CompleteInput {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: SystemPrompt;
  messages: ChatMessage[];
}

/** Run one completion through the provider adapter + Rust proxy and normalise the result. */
export async function complete(input: CompleteInput): Promise<ProviderResult> {
  const provider = getProvider(input.provider);
  const body = provider.buildRequest({
    system: input.system,
    messages: input.messages,
    model: input.model,
  });
  const resp = await llmComplete(input.provider, input.model, input.apiKey, body);
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`${provider.label} request failed (HTTP ${resp.status}): ${extractError(resp.body)}`);
  }
  return provider.parseResponse(resp.body);
}

/** Best-effort extraction of a human-readable error message from a provider error body. */
function extractError(body: unknown): string {
  if (body && typeof body === "object") {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    if (typeof (body as { message?: unknown }).message === "string") {
      return (body as { message: string }).message;
    }
  }
  return "no error detail";
}
