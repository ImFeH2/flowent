import { describe, expect, it } from "vitest";
import {
  deleteMapEntries,
  deleteMapEntry,
  filterStreamingDeltas,
  removePendingAssistantMessage,
} from "@/context/agentRuntimeState";
import type { PendingAssistantChatMessage, StreamingDelta } from "@/types";

function buildPendingMessage(
  overrides: Partial<PendingAssistantChatMessage> = {},
): PendingAssistantChatMessage {
  return {
    id: overrides.id ?? "pending-1",
    type: "PendingHumanMessage",
    from: "human",
    content: overrides.content ?? "hello",
    timestamp: overrides.timestamp ?? 1,
  };
}

describe("agentRuntimeState", () => {
  it("removes the first pending assistant message that matches content and timestamp", () => {
    const messages = [
      buildPendingMessage({ id: "a", content: "same", timestamp: 1 }),
      buildPendingMessage({ id: "b", content: "same", timestamp: 2 }),
    ];

    expect(removePendingAssistantMessage(messages, "same", 2)).toEqual([
      messages[0]!,
    ]);
  });

  it("removes the first pending assistant message that matches content when timestamp is omitted", () => {
    const messages = [
      buildPendingMessage({ id: "a", content: "same", timestamp: 1 }),
      buildPendingMessage({ id: "b", content: "same", timestamp: 2 }),
    ];

    expect(removePendingAssistantMessage(messages, "same")).toEqual([
      messages[1]!,
    ]);
  });

  it("removes one or many map entries while preserving unrelated keys", () => {
    const current = new Map([
      ["assistant", 1],
      ["worker", 2],
      ["reviewer", 3],
    ]);

    expect(deleteMapEntry(current, "worker")).toEqual(
      new Map([
        ["assistant", 1],
        ["reviewer", 3],
      ]),
    );
    expect(deleteMapEntries(current, ["assistant", "reviewer"])).toEqual(
      new Map([["worker", 2]]),
    );
  });

  it("filters agent streaming deltas and drops the agent key when no deltas remain", () => {
    const current = new Map<string, StreamingDelta[]>([
      [
        "assistant",
        [
          { type: "ContentDelta", text: "hello" },
          { type: "ToolResultDelta", tool_call_id: "tool-1", text: "done" },
        ],
      ],
      ["worker", [{ type: "ThinkingDelta", text: "plan" }]],
    ]);

    expect(
      filterStreamingDeltas(current, "assistant", (delta) => {
        return delta.type !== "ContentDelta";
      }),
    ).toEqual(
      new Map<string, StreamingDelta[]>([
        [
          "assistant",
          [{ type: "ToolResultDelta", tool_call_id: "tool-1", text: "done" }],
        ],
        ["worker", [{ type: "ThinkingDelta", text: "plan" }]],
      ]),
    );

    expect(filterStreamingDeltas(current, "assistant", () => false)).toEqual(
      new Map<string, StreamingDelta[]>([
        ["worker", [{ type: "ThinkingDelta", text: "plan" }]],
      ]),
    );
  });
});
