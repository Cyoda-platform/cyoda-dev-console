import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAssistantConfig } from "../keyStore.js";

// The test env's built-in localStorage shim is incomplete, so stub a real in-memory one.
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe("useAssistantConfig", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    useAssistantConfig.setState({ provider: "anthropic", model: "claude-sonnet-4-6", keys: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("switching provider resets the model to that provider's default", () => {
    useAssistantConfig.getState().setProvider("openai");
    expect(useAssistantConfig.getState().provider).toBe("openai");
    expect(useAssistantConfig.getState().model).toBe("gpt-5.4");
  });

  it("stores per-provider keys and persists them to localStorage", () => {
    useAssistantConfig.getState().setKey("anthropic", "sk-ant-123");
    expect(useAssistantConfig.getState().keys.anthropic).toBe("sk-ant-123");
    const persisted = JSON.parse(localStorage.getItem("cyoda-assistant-config")!);
    expect(persisted.keys.anthropic).toBe("sk-ant-123");
  });
});
