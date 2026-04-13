import { createRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantChatComposer,
  AssistantChatMessages,
} from "@/components/AssistantChatContent";
import type { AssistantChatItem, Node } from "@/types";

afterEach(() => {
  cleanup();
});

describe("AssistantChatMessages", () => {
  it("renders idle tool calls before and after the result is available", () => {
    const nodes = new Map<string, Node>([
      [
        "worker-1",
        {
          id: "worker-1",
          node_type: "agent",
          is_leader: false,
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
  }, 10000);

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

  it("renders an inline running hint at the end of the timeline", () => {
    const scrollRef = createRef<HTMLDivElement>();

    render(
      <AssistantChatMessages
        items={[
          {
            type: "PendingHumanMessage",
            id: "pending-2",
            from: "human",
            content: "Inspect the deployment issue",
            timestamp: 10,
          },
        ]}
        onScroll={() => {}}
        runningHint={{
          label: "Running tools...",
          toolName: "manage_roles",
        }}
        scrollRef={scrollRef}
        variant="workspace"
      />,
    );

    expect(screen.getByText("Running tools...")).toBeInTheDocument();
    expect(screen.getByText("manage_roles")).toBeInTheDocument();
  });

  it("shows the empty state when only state entries remain after a chat clear", () => {
    const scrollRef = createRef<HTMLDivElement>();

    render(
      <AssistantChatMessages
        items={[
          {
            type: "StateEntry",
            state: "idle",
            reason: "assistant chat cleared",
            timestamp: 1,
          },
        ]}
        onScroll={() => {}}
        scrollRef={scrollRef}
        variant="workspace"
      />,
    );

    expect(screen.getAllByText("Start a conversation").length).toBeGreaterThan(
      0,
    );
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
      screen.getByText("Workspace message").parentElement?.parentElement
        ?.parentElement?.parentElement;
    expect(workspaceBubble).not.toBeNull();
    expect(workspaceBubble).toHaveClass(
      "bg-white/[0.1]",
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
      screen.getByText("Panel message").parentElement?.parentElement
        ?.parentElement?.parentElement;
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

  it("copies human message content with the same copy action style", async () => {
    const scrollRef = createRef<HTMLDivElement>();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <AssistantChatMessages
        items={[
          {
            type: "ReceivedMessage",
            from_id: "human",
            content: "Copy this human message",
            timestamp: 1,
          },
        ]}
        onScroll={() => {}}
        scrollRef={scrollRef}
        variant="workspace"
      />,
    );

    const messageGroup = screen
      .getByText("Copy this human message")
      .closest(".group");

    expect(messageGroup).not.toBeNull();
    fireEvent.click(
      within(messageGroup as HTMLElement).getByRole("button", { name: "Copy" }),
    );

    expect(writeText).toHaveBeenCalledWith("Copy this human message");
  });
});

describe("AssistantChatComposer", () => {
  it("keeps the send action inside the composer shell and grows with multiline input", () => {
    const onSend = vi.fn();
    const { rerender } = render(
      <AssistantChatComposer
        disabled={false}
        input=""
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={onSend}
        variant="workspace"
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Message Assistant or type / for commands",
    );
    const sendButton = screen.getByRole("button", { name: "Send message" });
    const composerShell = textarea.parentElement;

    expect(composerShell).not.toBeNull();
    expect(composerShell).toContainElement(sendButton);
    expect(composerShell?.className).toContain("border-white/14");
    expect(composerShell?.className).toContain(
      "shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_-22px_rgba(0,0,0,0.82),0_8px_16px_-14px_rgba(255,255,255,0.06)]",
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
        onSend={onSend}
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
        onSend={onSend}
        variant="workspace"
      />,
    );

    expect(textarea.style.height).toBe("176px");
    expect(textarea.style.overflowY).toBe("auto");

    getComputedStyleSpy.mockRestore();
  });

  it("switches the workspace action to stop while the assistant is running", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    render(
      <AssistantChatComposer
        busy
        disabled
        input=""
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={onSend}
        onStop={onStop}
        variant="workspace"
      />,
    );

    const stopButton = screen.getByRole("button", { name: "Stop assistant" });
    expect(stopButton).toHaveTextContent("Stop");
    expect(stopButton.className).toContain("bg-red-500/20");

    fireEvent.click(stopButton);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows filtered command suggestions and inserts compact with a trailing space", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <AssistantChatComposer
        disabled={false}
        input="/"
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Message Assistant or type / for commands",
    );

    expect(
      screen.getByRole("listbox", { name: "Assistant commands" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("/compact ");
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("dismisses the command suggestions with Escape without clearing the input", () => {
    render(
      <AssistantChatComposer
        disabled={false}
        input="/"
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Message Assistant or type / for commands",
    ) as HTMLTextAreaElement;

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(
      screen.queryByRole("listbox", { name: "Assistant commands" }),
    ).not.toBeInTheDocument();
    expect(textarea.value).toBe("/");
  });

  it("keeps the command panel open with an empty state when no command matches", () => {
    render(
      <AssistantChatComposer
        disabled={false}
        input="/unknown"
        onChange={() => {}}
        onKeyDown={() => {}}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    expect(
      screen.getByRole("listbox", { name: "Assistant commands" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No matching commands.")).toBeInTheDocument();
  });

  it("keeps the exact command selected and lets Enter pass through for sending", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <AssistantChatComposer
        disabled={false}
        input="/help"
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSend={() => {}}
        variant="workspace"
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Message Assistant or type / for commands",
    );

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
