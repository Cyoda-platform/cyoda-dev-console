import { useState } from "react";
import { useAssistantConfig } from "./keyStore.js";
import { complete } from "./llmClient.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { validateAndCanonicalize } from "./applyWorkflow.js";
import type { ChatMessage } from "./providers/index.js";

export interface Proposal {
  /** The workflow JSON the proposal was computed against (left/"Current" diff pane). */
  current: string;
  /** Canonicalized, validated replacement payload (right/"Proposed" diff pane). */
  canonical: string;
}

export interface AssistantChatOptions {
  /**
   * Source of the workflow JSON the model reasons about. Returns `undefined` when there is no
   * workflow context (no file open / not a valid workflow), which switches the assistant into
   * general-question mode and disables tool-apply.
   */
  getCurrentJson: () => string | undefined | Promise<string | undefined>;
  /** Relative path shown to the model and used in the "applied" confirmation. */
  relPath?: string;
  /** Where an accepted proposal goes — the editor session, or disk, depending on the consumer. */
  onApply: (canonicalJson: string) => void | Promise<void>;
}

export interface AssistantChat {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  error: string | null;
  proposal: Proposal | null;
  applying: boolean;
  applied: string | null;
  hasKey: boolean;
  canSend: boolean;
  send: () => Promise<void>;
  applyProposal: () => Promise<void>;
  discardProposal: () => void;
}

/**
 * The send/propose/apply state machine shared by the in-editor workflow drawer and the
 * full-page assistant. The only thing that differs between consumers is where context comes
 * from (`getCurrentJson`) and where an accepted change lands (`onApply`).
 */
export function useAssistantChat({ getCurrentJson, relPath, onApply }: AssistantChatOptions): AssistantChat {
  const { provider, model, keys } = useAssistantConfig();
  const apiKey = keys[provider] ?? "";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const hasKey = apiKey.trim() !== "";
  const canSend = hasKey && input.trim() !== "" && !sending;

  async function send() {
    const userText = input.trim();
    if (!userText) return;
    setInput("");
    setError(null);
    setApplied(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const current = await getCurrentJson();
      const system = buildSystemPrompt({
        ...(relPath ? { workflowRelPath: relPath } : {}),
        ...(current !== undefined ? { currentJson: current } : {}),
      });
      const result = await complete({ provider, apiKey, model, system, messages: nextMessages });

      if (result.text) {
        setMessages((m) => [...m, { role: "assistant", content: result.text! }]);
      }
      if (result.toolCall) {
        if (current === undefined) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Open a workflow file in the editor so I can apply this change." },
          ]);
        } else {
          const validated = validateAndCanonicalize(result.toolCall.workflowJson);
          if (validated.ok) {
            setProposal({ current, canonical: validated.canonical });
          } else {
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: "I proposed a change but it failed validation:\n- " + validated.issues.join("\n- "),
              },
            ]);
          }
        }
      } else if (!result.text) {
        setMessages((m) => [...m, { role: "assistant", content: "(no response)" }]);
      }
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setSending(false);
    }
  }

  async function applyProposal() {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(proposal.canonical);
      setProposal(null);
      setApplied(relPath ? `Applied changes to ${relPath}.` : "Applied changes.");
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setApplying(false);
    }
  }

  function discardProposal() {
    setProposal(null);
  }

  return {
    messages,
    input,
    setInput,
    sending,
    error,
    proposal,
    applying,
    applied,
    hasKey,
    canSend,
    send,
    applyProposal,
    discardProposal,
  };
}
