import { useEffect, useState } from "react";
import { useAssistantConfig } from "./keyStore.js";
import { complete } from "./llmClient.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { validateAndCanonicalize } from "./applyWorkflow.js";
import type { ChatMessage } from "./providers/index.js";

/**
 * Per-file conversation history, persisted to localStorage so it survives both `WorkflowRoute`
 * remounts (it's keyed by file path, so switching workflows would otherwise reset
 * `useAssistantChat`'s local state) and app restarts. Bounded on both axes — number of files
 * tracked and messages per file — to keep storage size predictable.
 */
const CHAT_HISTORY_STORAGE_KEY = "cyoda-assistant-chat-history";
const MAX_HISTORY_FILES = 30;
const MAX_MESSAGES_PER_FILE = 100;

function loadChatHistory(): Map<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, ChatMessage[]>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveChatHistory(history: Map<string, ChatMessage[]>): void {
  try {
    // Keep only the most recently touched files — bounds storage size as more files are opened.
    const entries = [...history.entries()].slice(-MAX_HISTORY_FILES);
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage unavailable or over quota; history stays in-memory for this session.
  }
}

const chatHistoryByPath = loadChatHistory();

function rememberChatHistory(relPath: string, messages: ChatMessage[]): void {
  // Re-insert so the Map's iteration order reflects most-recently-touched (LRU-ish trimming).
  chatHistoryByPath.delete(relPath);
  if (messages.length > 0) {
    chatHistoryByPath.set(relPath, messages.slice(-MAX_MESSAGES_PER_FILE));
  }
  saveChatHistory(chatHistoryByPath);
}

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

  const [messages, setMessages] = useState<ChatMessage[]>(
    () => (relPath ? chatHistoryByPath.get(relPath) : undefined) ?? [],
  );

  useEffect(() => {
    if (!relPath) return;
    rememberChatHistory(relPath, messages);
  }, [relPath, messages]);

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
    const nextMessages: ChatMessage[] = [...messages, { id: crypto.randomUUID(), role: "user", content: userText }];
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
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: result.text! }]);
      }
      if (result.toolCall) {
        if (current === undefined) {
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "assistant", content: "Open a workflow file in the editor so I can apply this change." },
          ]);
        } else {
          const validated = validateAndCanonicalize(result.toolCall.workflowJson);
          if (validated.ok) {
            setProposal({ current, canonical: validated.canonical });
          } else {
            setMessages((m) => [
              ...m,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "I proposed a change but it failed validation:\n- " + validated.issues.join("\n- "),
              },
            ]);
          }
        }
      } else if (!result.text) {
        // Do NOT push to messages — two consecutive assistant turns break Anthropic's
        // role-alternation requirement. Show as a transient error instead.
        setError("The model returned an empty response. Please try again.");
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
      const appliedText = relPath ? `Applied changes to ${relPath}.` : "Applied changes.";
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: appliedText,
          appliedProposal: { current: proposal.current, canonical: proposal.canonical },
        },
      ]);
      setProposal(null);
      setApplied(appliedText);
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
