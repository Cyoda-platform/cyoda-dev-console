import { describe, it, expect, vi, beforeEach } from "vitest";
import { complete } from "../llmClient.js";

vi.mock("../../ipc/llm.js", () => ({
  llmComplete: vi.fn(),
}));

import { llmComplete } from "../../ipc/llm.js";

const llmMock = vi.mocked(llmComplete);

const input = {
  provider: "anthropic" as const,
  apiKey: "sk-test",
  model: "claude-sonnet-4-6",
  system: "You help with Cyoda workflows.",
  messages: [{ id: "1", role: "user" as const, content: "Add a state" }],
};

describe("complete (llmClient)", () => {
  beforeEach(() => llmMock.mockReset());

  it("returns the parsed provider result on HTTP 200", async () => {
    llmMock.mockResolvedValue({
      status: 200,
      body: {
        content: [{ type: "text", text: "Here you go" }],
      },
    });
    const result = await complete(input);
    expect(result.text).toBe("Here you go");
  });

  it("throws with provider name and status on HTTP 4xx", async () => {
    llmMock.mockResolvedValue({
      status: 401,
      body: { error: { message: "Invalid API key" } },
    });
    await expect(complete(input)).rejects.toThrow("HTTP 401");
    await expect(complete(input)).rejects.toThrow("Anthropic");
  });

  it("throws on HTTP 5xx", async () => {
    llmMock.mockResolvedValue({ status: 500, body: {} });
    await expect(complete(input)).rejects.toThrow("HTTP 500");
  });

  it("extracts error.message from the response body in the thrown error", async () => {
    llmMock.mockResolvedValue({
      status: 400,
      body: { error: { message: "context length exceeded" } },
    });
    await expect(complete(input)).rejects.toThrow("context length exceeded");
  });

  it("extracts error string from the response body", async () => {
    llmMock.mockResolvedValue({
      status: 429,
      body: { error: "rate limited" },
    });
    await expect(complete(input)).rejects.toThrow("rate limited");
  });

  it("extracts top-level message from the response body", async () => {
    llmMock.mockResolvedValue({
      status: 503,
      body: { message: "service unavailable" },
    });
    await expect(complete(input)).rejects.toThrow("service unavailable");
  });

  it("falls back to 'no error detail' for unrecognised body shapes", async () => {
    llmMock.mockResolvedValue({ status: 400, body: null });
    await expect(complete(input)).rejects.toThrow("no error detail");
  });

  it("passes the model to llmComplete", async () => {
    llmMock.mockResolvedValue({ status: 200, body: { content: [] } });
    await complete({ ...input, model: "claude-opus-4-8" });
    expect(llmMock).toHaveBeenCalledWith(
      "anthropic",
      "claude-opus-4-8",
      "sk-test",
      expect.anything(),
    );
  });
});
