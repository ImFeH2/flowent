import type { AssistantInputHistoryEntry } from "@/types";
import {
  appendChatInputHistoryEntry,
  clearChatInputHistoryForTests,
  getChatInputHistorySnapshot,
  resetChatInputHistorySessionForTests,
  subscribeChatInputHistory,
} from "@/lib/chatInputHistory";

const ASSISTANT_HISTORY_SCOPE = "assistant";

export function getAssistantInputHistorySnapshot(): AssistantInputHistoryEntry[] {
  return getChatInputHistorySnapshot(ASSISTANT_HISTORY_SCOPE);
}

export function subscribeAssistantInputHistory(listener: () => void) {
  return subscribeChatInputHistory(ASSISTANT_HISTORY_SCOPE, listener);
}

export function appendAssistantInputHistoryEntry(
  entry: AssistantInputHistoryEntry,
) {
  appendChatInputHistoryEntry(ASSISTANT_HISTORY_SCOPE, entry);
}

export function resetAssistantInputHistorySessionForTests() {
  resetChatInputHistorySessionForTests();
}

export function clearAssistantInputHistoryForTests() {
  clearChatInputHistoryForTests(ASSISTANT_HISTORY_SCOPE);
}
