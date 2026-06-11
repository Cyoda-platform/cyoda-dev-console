import type { LlmProvider, ProviderId } from "./types.js";
import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { gemini } from "./gemini.js";

export const PROVIDERS: Record<ProviderId, LlmProvider> = {
  anthropic,
  openai,
  gemini,
};

export const PROVIDER_LIST: LlmProvider[] = [anthropic, openai, gemini];

export function getProvider(id: ProviderId): LlmProvider {
  return PROVIDERS[id];
}

export type { LlmProvider, ProviderId, ChatMessage, ProviderResult, SystemPrompt } from "./types.js";
