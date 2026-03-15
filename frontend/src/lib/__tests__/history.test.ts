import { describe, expect, it } from "vitest";
import { historyTimestampToMs, mergeHistoryWithDeltas } from "@/lib/history";
import type { HistoryEntry, StreamingDelta } from "@/types";

describe("history utilities", () => {
  it("normalizes second-based timestamps to milliseconds", () => {
    expect(historyTimestampToMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(historyTimestampToMs(1_700_000_000_123)).toBe(1_700_000_000_123);
  });

  it("merges content, thinking, and tool result deltas into a live history view", () => {
    const history: HistoryEntry[] = [
      {
        type: "ReceivedMessage",
        from_id: "human",
        content: "Review the workshop notes.",
        timestamp: 10,
      },
      {
        type: "ToolCall",
        tool_name: "list_dir",
        tool_call_id: "call-1",
        arguments: { path: "." },
        streaming: true,
        timestamp: 11,
      },
    ];
    const incremental: HistoryEntry[] = [
      {
        type: "ReceivedMessage",
        from_id: "human",
        content: "Then draft a brief summary.",
        timestamp: 12,
      },
    ];
    const deltas: StreamingDelta[] = [
      { type: "ThinkingDelta", text: "First, extract the key takeaways." },
      {
        type: "ContentDelta",
        text: "The notes cover schedule, speakers, and logistics.",
      },
      {
        type: "ToolResultDelta",
        tool_call_id: "call-1",
        text: "schedule\nspeakers\nlogistics",
      },
    ];

    const result = mergeHistoryWithDeltas({
      history,
      incremental,
      deltas,
      fetchedAt: 15_000,
    });

    expect(result).toEqual([
      history[0],
      {
        ...history[1],
        result: "schedule\nspeakers\nlogistics",
      },
      incremental[0],
      {
        type: "AssistantThinking",
        content: "First, extract the key takeaways.",
        timestamp: 15,
        streaming: true,
      },
      {
        type: "AssistantText",
        content: "The notes cover schedule, speakers, and logistics.",
        timestamp: 15,
        streaming: true,
      },
    ]);
  });
});
