import type { HistoryEntry, StreamingDelta } from "@/types";

export function historyTimestampToMs(timestamp: number): number {
  return timestamp > 1_000_000_000_000
    ? timestamp
    : Math.round(timestamp * 1000);
}

export function reduceDeltas(deltas: StreamingDelta[]) {
  let content = "";
  let thinking = "";
  const toolResults = new Map<string, string>();

  for (const delta of deltas) {
    switch (delta.type) {
      case "ContentDelta":
        content += delta.text;
        break;
      case "ThinkingDelta":
        thinking += delta.text;
        break;
      case "ToolResultDelta":
        toolResults.set(
          delta.tool_call_id,
          (toolResults.get(delta.tool_call_id) ?? "") + delta.text,
        );
        break;
    }
  }

  return { content, thinking, toolResults };
}

function serializeHistoryValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getHistoryEntryDedupKey(entry: HistoryEntry): string {
  const timestamp = historyTimestampToMs(entry.timestamp);

  switch (entry.type) {
    case "ReceivedMessage":
      return [
        entry.type,
        timestamp,
        entry.from_id ?? "",
        entry.content ?? "",
      ].join(":");
    case "SentMessage":
      return [
        entry.type,
        timestamp,
        (entry.to_ids ?? []).join(","),
        entry.content ?? "",
      ].join(":");
    case "ToolCall":
      if (entry.tool_call_id) {
        return `${entry.type}:${entry.tool_call_id}`;
      }
      return [
        entry.type,
        timestamp,
        entry.tool_name ?? "",
        serializeHistoryValue(entry.arguments),
        entry.result ?? "",
        entry.streaming ? "streaming" : "final",
      ].join(":");
    default:
      return [entry.type, timestamp, entry.content ?? ""].join(":");
  }
}

function shouldReplaceDuplicateHistoryEntry(
  existing: HistoryEntry,
  candidate: HistoryEntry,
): boolean {
  if (existing.type !== "ToolCall" || candidate.type !== "ToolCall") {
    return false;
  }

  if (existing.streaming && !candidate.streaming) {
    return true;
  }

  return !existing.result && Boolean(candidate.result);
}

function dedupeHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const deduped: HistoryEntry[] = [];
  const seenIndexes = new Map<string, number>();

  for (const entry of entries) {
    const key = getHistoryEntryDedupKey(entry);
    const existingIndex = seenIndexes.get(key);

    if (existingIndex === undefined) {
      seenIndexes.set(key, deduped.length);
      deduped.push(entry);
      continue;
    }

    const existing = deduped[existingIndex];
    if (shouldReplaceDuplicateHistoryEntry(existing, entry)) {
      deduped[existingIndex] = entry;
    }
  }

  return deduped;
}

export function mergeHistoryWithDeltas({
  history,
  incremental,
  deltas,
  fetchedAt,
}: {
  history: HistoryEntry[];
  incremental?: HistoryEntry[];
  deltas?: StreamingDelta[];
  fetchedAt: number;
}): HistoryEntry[] {
  const base = dedupeHistoryEntries(
    incremental && incremental.length > 0
      ? [...history, ...incremental]
      : [...history],
  );

  if (!deltas || deltas.length === 0) {
    return base;
  }

  const { content, thinking, toolResults } = reduceDeltas(deltas);
  const now = fetchedAt / 1000;

  if (thinking) {
    base.push({
      type: "AssistantThinking",
      content: thinking,
      timestamp: now,
      streaming: true,
    } satisfies HistoryEntry);
  }

  if (content) {
    base.push({
      type: "AssistantText",
      content,
      timestamp: now,
      streaming: true,
    } satisfies HistoryEntry);
  }

  if (toolResults.size > 0) {
    for (const [toolCallId, resultText] of toolResults) {
      for (let i = base.length - 1; i >= 0; i -= 1) {
        const entry = base[i];
        if (
          entry.type === "ToolCall" &&
          entry.tool_call_id === toolCallId &&
          entry.streaming
        ) {
          base[i] = { ...entry, result: resultText };
          break;
        }
      }
    }
  }

  return base;
}
