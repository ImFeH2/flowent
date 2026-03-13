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
        content: "帮我看一下目录",
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
        content: "另外总结一下",
        timestamp: 12,
      },
    ];
    const deltas: StreamingDelta[] = [
      { type: "ThinkingDelta", text: "先检查目录结构。" },
      { type: "ContentDelta", text: "当前目录包含 app 和 frontend。" },
      {
        type: "ToolResultDelta",
        tool_call_id: "call-1",
        text: "app\nfrontend",
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
        result: "app\nfrontend",
      },
      incremental[0],
      {
        type: "AssistantThinking",
        content: "先检查目录结构。",
        timestamp: 15,
        streaming: true,
      },
      {
        type: "AssistantText",
        content: "当前目录包含 app 和 frontend。",
        timestamp: 15,
        streaming: true,
      },
    ]);
  });
});
