import { create } from "zustand";
import { getProvider, PROVIDER_LIST, type ProviderId } from "./providers/index.js";

const STORAGE_KEY = "cyoda-assistant-config";

interface Persisted {
  provider: ProviderId;
  model: string;
  /** API keys per provider. localStorage, origin-scoped (BYO_AI-spec §15). */
  keys: Partial<Record<ProviderId, string>>;
}

function defaults(): Persisted {
  return { provider: "anthropic", model: getProvider("anthropic").defaultModel, keys: {} };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<Persisted>;
    const provider =
      p.provider && PROVIDER_LIST.some((x) => x.id === p.provider)
        ? (p.provider as ProviderId)
        : "anthropic";
    return {
      provider,
      model: typeof p.model === "string" ? p.model : getProvider(provider).defaultModel,
      keys: p.keys && typeof p.keys === "object" ? p.keys : {},
    };
  } catch {
    return defaults();
  }
}

function save(p: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // localStorage unavailable; in-memory only
  }
}

interface AssistantConfig extends Persisted {
  setProvider: (provider: ProviderId) => void;
  setModel: (model: string) => void;
  setKey: (provider: ProviderId, key: string) => void;
}

export const useAssistantConfig = create<AssistantConfig>((set) => ({
  ...load(),
  setProvider: (provider) =>
    set((s) => {
      const model = getProvider(provider).defaultModel;
      save({ provider, model, keys: s.keys });
      return { provider, model };
    }),
  setModel: (model) =>
    set((s) => {
      save({ provider: s.provider, model, keys: s.keys });
      return { model };
    }),
  setKey: (provider, key) =>
    set((s) => {
      const keys = { ...s.keys, [provider]: key };
      save({ provider: s.provider, model: s.model, keys });
      return { keys };
    }),
}));
