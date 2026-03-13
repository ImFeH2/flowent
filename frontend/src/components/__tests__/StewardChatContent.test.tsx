import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StewardChatMessages } from "@/components/StewardChatContent";
import type { StewardChatItem } from "@/types";

describe("StewardChatMessages", () => {
  it("renders thinking and tool call activity cards in the chat timeline and hides idle tool calls", () => {
    const items: StewardChatItem[] = [
      {
        type: "PendingHumanMessage",
        id: "pending-1",
        from: "human",
        content: "看看当前目录",
        timestamp: 1,
      },
      {
        type: "AssistantThinking",
        content: "先判断是否需要创建 root agent。",
        timestamp: 2,
        streaming: true,
      },
      {
        type: "ToolCall",
        tool_name: "create_root",
        tool_call_id: "tool-1",
        arguments: { role: "Worker" },
        result: '{"agent_id":"worker-1"}',
        timestamp: 3,
        streaming: false,
      },
      {
        type: "ToolCall",
        tool_name: "idle",
        tool_call_id: "tool-2",
        arguments: {},
        timestamp: 4,
        streaming: false,
      },
      {
        type: "AssistantText",
        content: "当前目录包含 frontend、app 和 tests。",
        timestamp: 5,
      },
    ];

    render(
      <StewardChatMessages
        items={items}
        onScroll={() => {}}
        scrollRef={createRef<HTMLDivElement>()}
        variant="workspace"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Thinking/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("先判断是否需要创建 root agent。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Root/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /idle/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("当前目录包含 frontend、app 和 tests。"),
    ).toBeInTheDocument();
  });
});
