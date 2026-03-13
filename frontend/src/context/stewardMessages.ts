import type { StewardMessage } from "@/types";

export function appendStewardMessage(
  messages: StewardMessage[],
  nextMessage: StewardMessage,
): StewardMessage[] {
  const last = messages[messages.length - 1];
  if (
    last &&
    last.from === nextMessage.from &&
    last.content === nextMessage.content &&
    Math.abs(last.timestamp - nextMessage.timestamp) < 1500
  ) {
    return messages;
  }
  return [...messages, nextMessage];
}

export function appendStewardStreamChunk(
  messages: StewardMessage[],
  activeStreamMessageId: string | null,
  content: string,
  createMessage: () => StewardMessage,
): { messages: StewardMessage[]; activeStreamMessageId: string } {
  if (activeStreamMessageId) {
    const index = messages.findIndex(
      (message) =>
        message.id === activeStreamMessageId && message.from === "steward",
    );
    if (index >= 0) {
      const next = [...messages];
      next[index] = {
        ...next[index],
        content: `${next[index].content}${content}`,
      };
      return { messages: next, activeStreamMessageId };
    }
  }

  const nextMessage = createMessage();
  return {
    messages: [...messages, nextMessage],
    activeStreamMessageId: nextMessage.id,
  };
}

export function finalizeStewardStream(
  messages: StewardMessage[],
  activeStreamMessageId: string | null,
  finalMessage: StewardMessage,
): { messages: StewardMessage[]; activeStreamMessageId: null } {
  if (activeStreamMessageId) {
    const index = messages.findIndex(
      (message) =>
        message.id === activeStreamMessageId && message.from === "steward",
    );
    if (index >= 0) {
      const next = [...messages];
      next[index] = {
        ...next[index],
        content: finalMessage.content,
        timestamp: finalMessage.timestamp,
      };
      return { messages: next, activeStreamMessageId: null };
    }
  }

  return {
    messages: appendStewardMessage(messages, finalMessage),
    activeStreamMessageId: null,
  };
}
