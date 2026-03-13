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
  const base =
    incremental && incremental.length > 0
      ? [...history, ...incremental]
      : [...history];

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
