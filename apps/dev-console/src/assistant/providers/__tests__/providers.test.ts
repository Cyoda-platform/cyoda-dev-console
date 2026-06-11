import { describe, it, expect } from "vitest";
import { anthropic } from "../anthropic.js";
import { openai } from "../openai.js";
import { gemini } from "../gemini.js";
import { TOOL_NAME, type BuildRequestInput } from "../types.js";

const input: BuildRequestInput = {
  system: { static: "You edit Cyoda workflows." },
  messages: [
    { id: "msg-1", role: "user", content: "Add a refund transition." },
    { id: "msg-2", role: "assistant", content: "Sure." },
  ],
  model: "test-model",
};

const inputWithDynamic: BuildRequestInput = {
  system: { static: "You edit Cyoda workflows.", dynamic: 'Current workflow JSON:\n```json\n{"a":1}\n```' },
  messages: input.messages,
  model: "test-model",
};

describe("anthropic adapter", () => {
  it("builds a request with the tool and a cached static system block", () => {
    const body = anthropic.buildRequest(input) as {
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
      model: string;
      messages: unknown[];
      tools: Array<{ name: string }>;
    };
    expect(body.system).toHaveLength(1);
    expect(body.system[0]).toEqual({
      type: "text",
      text: "You edit Cyoda workflows.",
      cache_control: { type: "ephemeral" },
    });
    expect(body.model).toBe("test-model");
    expect(body.tools[0]!.name).toBe(TOOL_NAME);
    expect(body.messages).toHaveLength(2);
  });

  it("adds a second cached block for the dynamic workflow JSON", () => {
    const body = anthropic.buildRequest(inputWithDynamic) as {
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
    };
    expect(body.system).toHaveLength(2);
    expect(body.system[0]).toEqual({
      type: "text",
      text: "You edit Cyoda workflows.",
      cache_control: { type: "ephemeral" },
    });
    expect(body.system[1]).toEqual({
      type: "text",
      text: 'Current workflow JSON:\n```json\n{"a":1}\n```',
      cache_control: { type: "ephemeral" },
    });
  });

  it("parses a tool_use response", () => {
    const result = anthropic.parseResponse({
      content: [
        { type: "text", text: "Here you go" },
        { type: "tool_use", name: TOOL_NAME, input: { workflow_json: '{"importMode":"MERGE"}' } },
      ],
    });
    expect(result.text).toBe("Here you go");
    expect(result.toolCall?.workflowJson).toBe('{"importMode":"MERGE"}');
  });

  it("parses a text-only response", () => {
    const result = anthropic.parseResponse({ content: [{ type: "text", text: "no change" }] });
    expect(result.text).toBe("no change");
    expect(result.toolCall).toBeUndefined();
  });
});

describe("openai adapter", () => {
  it("prepends the joined system message and includes the function tool", () => {
    const body = openai.buildRequest(input) as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ function: { name: string } }>;
    };
    expect(body.messages[0]).toEqual({ role: "system", content: "You edit Cyoda workflows." });
    expect(body.tools[0]!.function.name).toBe(TOOL_NAME);
  });

  it("joins static and dynamic system parts with a blank line", () => {
    const body = openai.buildRequest(inputWithDynamic) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]!.content).toBe(
      'You edit Cyoda workflows.\n\nCurrent workflow JSON:\n```json\n{"a":1}\n```',
    );
  });

  it("parses a tool_calls response (arguments are a JSON string)", () => {
    const result = openai.parseResponse({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { function: { name: TOOL_NAME, arguments: '{"workflow_json":"{}"}' } },
            ],
          },
        },
      ],
    });
    expect(result.toolCall?.workflowJson).toBe("{}");
  });

  it("parses a plain content response", () => {
    const result = openai.parseResponse({
      choices: [{ message: { content: "hello" } }],
    });
    expect(result.text).toBe("hello");
  });

  it("throws on malformed tool-call JSON arguments", () => {
    expect(() =>
      openai.parseResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { function: { name: TOOL_NAME, arguments: "NOT_VALID_JSON" } },
              ],
            },
          },
        ],
      })
    ).toThrow(/malformed tool-call arguments/i);
  });
});

describe("gemini adapter", () => {
  it("maps assistant role to model and carries the joined system_instruction", () => {
    const body = gemini.buildRequest(input) as {
      system_instruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string }>;
      tools: Array<{ function_declarations: Array<{ name: string }> }>;
    };
    expect(body.system_instruction.parts[0]!.text).toBe("You edit Cyoda workflows.");
    expect(body.contents[1]!.role).toBe("model");
    expect(body.tools[0]!.function_declarations[0]!.name).toBe(TOOL_NAME);
  });

  it("joins static and dynamic system parts with a blank line", () => {
    const body = gemini.buildRequest(inputWithDynamic) as {
      system_instruction: { parts: Array<{ text: string }> };
    };
    expect(body.system_instruction.parts[0]!.text).toBe(
      'You edit Cyoda workflows.\n\nCurrent workflow JSON:\n```json\n{"a":1}\n```',
    );
  });

  it("parses a functionCall response", () => {
    const result = gemini.parseResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: "done" },
              { functionCall: { name: TOOL_NAME, args: { workflow_json: '{"a":1}' } } },
            ],
          },
        },
      ],
    });
    expect(result.text).toBe("done");
    expect(result.toolCall?.workflowJson).toBe('{"a":1}');
  });
});
