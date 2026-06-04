import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../llmClient.js", () => ({ complete: vi.fn() }));

import { complete } from "../llmClient.js";
import { useAssistantChat } from "../useAssistantChat.js";
import { useAssistantConfig } from "../keyStore.js";
import { validateAndCanonicalize } from "../applyWorkflow.js";

const completeMock = vi.mocked(complete);

const WORKFLOW = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    { version: "1.0", name: "demo", initialState: "S", active: true, states: { S: { transitions: [] } } },
  ],
});

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe("useAssistantChat", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
    useAssistantConfig.setState({ provider: "anthropic", model: "claude-sonnet-4-6", keys: { anthropic: "sk-test" } });
    completeMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("routes an accepted proposal to onApply with the canonicalized JSON (never to disk)", async () => {
    completeMock.mockResolvedValue({ toolCall: { workflowJson: WORKFLOW } });
    const onApply = vi.fn();

    const { result } = renderHook(() =>
      useAssistantChat({ getCurrentJson: () => WORKFLOW, relPath: "workflows/w.json", onApply }),
    );

    act(() => result.current.setInput("add a suspended state"));
    await act(async () => {
      await result.current.send();
    });

    expect(result.current.proposal).not.toBeNull();

    await act(async () => {
      await result.current.applyProposal();
    });

    const expected = validateAndCanonicalize(WORKFLOW);
    expect(expected.ok).toBe(true);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expected.ok ? expected.canonical : "");
    expect(result.current.proposal).toBeNull();
    expect(result.current.applied).toContain("workflows/w.json");
  });

  it("declines to propose when there is no workflow context", async () => {
    completeMock.mockResolvedValue({ toolCall: { workflowJson: WORKFLOW } });
    const onApply = vi.fn();

    const { result } = renderHook(() =>
      useAssistantChat({ getCurrentJson: () => undefined, onApply }),
    );

    act(() => result.current.setInput("change it"));
    await act(async () => {
      await result.current.send();
    });

    expect(result.current.proposal).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    const last = result.current.messages.at(-1);
    expect(last?.content).toMatch(/open a workflow file/i);
  });
});
