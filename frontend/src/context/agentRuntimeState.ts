import type { PendingAssistantChatMessage, StreamingDelta } from "@/types";

function withoutFirstMatchingItem<T>(
  items: T[],
  predicate: (item: T) => boolean,
): T[] {
  const index = items.findIndex(predicate);
  if (index < 0) {
    return items;
  }

  const next = [...items];
  next.splice(index, 1);
  return next;
}

export function removePendingAssistantMessage(
  messages: PendingAssistantChatMessage[],
  matcher:
    | string
    | {
        content?: string;
        timestamp?: number;
        messageId?: string | null;
      },
  timestamp?: number,
): PendingAssistantChatMessage[] {
  const normalizedMatcher =
    typeof matcher === "string"
      ? {
          content: matcher,
          timestamp,
        }
      : matcher;
  return withoutFirstMatchingItem(messages, (message) => {
    if (
      normalizedMatcher.messageId &&
      message.message_id === normalizedMatcher.messageId
    ) {
      return true;
    }
    return (
      normalizedMatcher.content === message.content &&
      (normalizedMatcher.timestamp === undefined ||
        message.timestamp === normalizedMatcher.timestamp)
    );
  });
}

export function deleteMapEntries<K, V>(
  current: Map<K, V>,
  keys: Iterable<K>,
): Map<K, V> {
  let next: Map<K, V> | null = null;

  for (const key of keys) {
    if (!current.has(key)) {
      continue;
    }
    if (next === null) {
      next = new Map(current);
    }
    next.delete(key);
  }

  return next ?? current;
}

export function deleteMapEntry<K, V>(current: Map<K, V>, key: K): Map<K, V> {
  return deleteMapEntries(current, [key]);
}

export function filterStreamingDeltas(
  current: Map<string, StreamingDelta[]>,
  agentId: string,
  predicate: (delta: StreamingDelta) => boolean,
): Map<string, StreamingDelta[]> {
  const list = current.get(agentId);
  if (!list || list.length === 0) {
    return current;
  }

  const filtered = list.filter(predicate);
  if (filtered.length === 0) {
    return deleteMapEntry(current, agentId);
  }

  const next = new Map(current);
  next.set(agentId, filtered);
  return next;
}
