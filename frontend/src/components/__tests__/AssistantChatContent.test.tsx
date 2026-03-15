import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantChatMessages } from "@/components/AssistantChatContent";
import type { AssistantChatItem } from "@/types";

describe("AssistantChatMessages", () => {
  it("renders thinking and tool call activity cards in the chat timeline and hides idle tool calls", () => {
    const items: AssistantChatItem[] = [
      {
        type: "PendingHumanMessage",
        id: "pending-1",
        from: "human",
        content: "Plan a weekend trip",
        timestamp: 1,
      },
      {
        type: "AssistantThinking",
        content:
          "First, decide whether this needs a dedicated planning worker.",
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
        content: "Here is a draft plan with priorities and next steps.",
        timestamp: 5,
      },
    ];

    render(
      <AssistantChatMessages
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
      screen.getByText(
        "First, decide whether this needs a dedicated planning worker.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Root/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /idle/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Here is a draft plan with priorities and next steps."),
    ).toBeInTheDocument();
  });
});
