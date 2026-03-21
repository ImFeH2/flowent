import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AssistantChatComposer,
  AssistantChatMessages,
} from "@/components/AssistantChatContent";
import type { AssistantChatItem, Node } from "@/types";

describe("AssistantChatMessages", () => {
  it("renders idle tool calls before and after the result is available", () => {
    const nodes = new Map<string, Node>([
      [
        "worker-1",
        {
          id: "worker-1",
          node_type: "agent",
          graph_id: "graph-1",
          state: "running",
          connections: [],
          name: "Project Analyst",
          todos: [],
          role_name: "Worker",
        },
      ],
    ]);
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
        streaming: true,
      },
      {
        type: "ToolCall",
        tool_name: "idle",
        tool_call_id: "tool-2b",
        arguments: {},
        result: "idle 1.25s",
        timestamp: 4,
        streaming: false,
      },
      {
        type: "AssistantText",
        content: "Here is a draft plan with priorities and next steps.",
        timestamp: 5,
      },
      {
        type: "ReceivedMessage",
        from_id: "worker-1",
        content: "I have inspected the project root.",
        timestamp: 5.5,
      },
      {
        type: "SentMessage",
        content: "Worker, continue the task.",
        to_ids: ["worker-1"],
        timestamp: 6,
      },
    ];

    render(
      <AssistantChatMessages
        items={items}
        nodes={nodes}
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
    fireEvent.click(screen.getByRole("button", { name: /Create Root/i }));
    expect(
      screen.getByText(
        (_, element) => element?.textContent === '{\n    "role": "Worker"\n}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent === '{\n    "agent_id": "worker-1"\n}',
      ),
    ).toBeInTheDocument();
    const idleButtons = screen.getAllByRole("button", { name: /idle/i });
    expect(idleButtons).toHaveLength(2);
    expect(screen.queryByText("Running...")).not.toBeInTheDocument();
    fireEvent.click(idleButtons[0]!);
    expect(
      within(idleButtons[0]!.parentElement as HTMLElement).queryByText(
        "Result",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(idleButtons[1]!);
    expect(screen.getByText("idle 1.25s")).toBeInTheDocument();
    expect(
      screen.getByText("Here is a draft plan with priorities and next steps."),
    ).toBeInTheDocument();
    expect(screen.getByText("From Project Analyst")).toBeInTheDocument();
    expect(screen.getByText("To Project Analyst")).toBeInTheDocument();
    expect(
      screen.queryByText("I have inspected the project root."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Worker, continue the task."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /From Project Analyst/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /To Project Analyst/i }),
    );

    expect(
      screen.getByText("I have inspected the project root."),
    ).toBeInTheDocument();
    expect(screen.getByText("Worker, continue the task.")).toBeInTheDocument();
  });

  it("applies bottom inset space for an overlay composer", () => {
    const scrollRef = createRef<HTMLDivElement>();

    render(
      <AssistantChatMessages
        bottomInset={120}
        items={[]}
        onScroll={() => {}}
        scrollRef={scrollRef}
        variant="workspace"
      />,
    );

    expect(scrollRef.current).not.toBeNull();
    expect(scrollRef.current?.style.paddingBottom).toBe("134px");
    expect(scrollRef.current?.style.scrollPaddingBottom).toBe("134px");
  });

  it("renders human bubbles with gray surfaces and white text", () => {
    const workspaceScrollRef = createRef<HTMLDivElement>();
    const panelScrollRef = createRef<HTMLDivElement>();
    const workspaceItems: AssistantChatItem[] = [
      {
        type: "ReceivedMessage",
        from_id: "human",
        content: "Workspace message",
        timestamp: 1,
      },
    ];
    const panelItems: AssistantChatItem[] = [
      {
        type: "ReceivedMessage",
        from_id: "human",
        content: "Panel message",
        timestamp: 2,
      },
    ];

    const { rerender } = render(
      <AssistantChatMessages
        items={workspaceItems}
        onScroll={() => {}}
        scrollRef={workspaceScrollRef}
        variant="workspace"
      />,
    );

    const workspaceBubble =
      screen.getByText("Workspace message").parentElement?.parentElement;
    expect(workspaceBubble).not.toBeNull();
    expect(workspaceBubble).toHaveClass(
      "bg-white/[0.12]",
      "text-white",
      "border-white/8",
    );

    rerender(
      <AssistantChatMessages
        items={panelItems}
        onScroll={() => {}}
        scrollRef={panelScrollRef}
        variant="panel"
      />,
    );

    const panelBubble =
      screen.getByText("Panel message").parentElement?.parentElement;
    expect(panelBubble).not.toBeNull();
    expect(panelBubble).toHaveClass(
      "bg-white/[0.08]",
      "text-white",
      "border-white/10",
    );
  });

  it("renders streaming assistant text with an inline cursor", () => {
    const scrollRef = createRef<HTMLDivElement>();

    render(
      <AssistantChatMessages
        items={[
          {
            type: "AssistantText",
            content: "Streaming response",
            timestamp: 1,
            streaming: true,
          },
        ]}
        onScroll={() => {}}
        scrollRef={scrollRef}
        variant="workspace"
      />,
    );

    const textNode = screen.getByText("Streaming response");
    const contentBlock = textNode.parentElement;
    expect(contentBlock).not.toBeNull();
    expect(contentBlock?.querySelector(".streaming-cursor")).not.toBeNull();
  });
});

describe("AssistantChatComposer", () => {
  it("keeps the send action inside the composer shell and grows with multiline input", () => {
    const { rerender } = render(
      <AssistantChatComposer
        disabled={false}
        input=""
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    const textarea = screen.getByPlaceholderText("Message the Assistant...");
    const sendButton = screen.getByRole("button", { name: "Send message" });
    const composerShell = textarea.parentElement;

    expect(composerShell).not.toBeNull();
    expect(composerShell).toContainElement(sendButton);
    expect(composerShell?.className).toContain("border-white/18");
    expect(composerShell?.className).toContain(
      "shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_38px_-24px_rgba(0,0,0,0.88),0_10px_18px_-14px_rgba(255,255,255,0.08)]",
    );

    const originalGetComputedStyle = window.getComputedStyle;
    const getComputedStyleSpy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element) => {
        if (element === textarea) {
          return {
            ...originalGetComputedStyle(element),
            lineHeight: "20px",
            paddingTop: "8px",
            paddingBottom: "8px",
          } as CSSStyleDeclaration;
        }

        return originalGetComputedStyle(element);
      });

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 96,
    });

    rerender(
      <AssistantChatComposer
        disabled={false}
        input={"line 1\nline 2\nline 3\nline 4"}
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    expect(textarea.style.height).toBe("96px");
    expect(textarea.style.overflowY).toBe("hidden");

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 240,
    });

    rerender(
      <AssistantChatComposer
        disabled={false}
        input={"1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11"}
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    expect(textarea.style.height).toBe("176px");
    expect(textarea.style.overflowY).toBe("auto");

    getComputedStyleSpy.mockRestore();
  });
});
