import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryView } from "@/components/HistoryView";
import type { HistoryEntry, Node } from "@/types";

describe("HistoryView", () => {
  it("renders message and assistant entries collapsed by default and expands on demand", () => {
    const history: HistoryEntry[] = [
      {
        type: "ReceivedMessage",
        from_id: "agent-12345678",
        content: "Review the workshop notes.",
        timestamp: 1,
      },
      {
        type: "AssistantText",
        content: "The notes cover schedule, speakers, and logistics.",
        timestamp: 2,
      },
    ];
    const nodes = new Map<string, Node>([
      [
        "agent-12345678",
        {
          id: "agent-12345678",
          node_type: "agent",
          graph_id: "graph-1",
          state: "idle",
          connections: [],
          name: "Directory Analyzer",
          todos: [],
          role_name: "Worker",
        },
      ],
    ]);

    render(
      <HistoryView
        history={history}
        agentLabel="Project Planner"
        nodes={nodes}
      />,
    );

    expect(
      screen.getByRole("button", { name: /From Directory Analyzer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Project Planner/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Review the workshop notes."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("The notes cover schedule, speakers, and logistics."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Project Planner/i }));

    expect(
      screen.getByText("The notes cover schedule, speakers, and logistics."),
    ).toBeInTheDocument();
  });

  it("shows Human for received messages from the user", () => {
    render(
      <HistoryView
        history={[
          {
            type: "ReceivedMessage",
            from_id: "human",
            content: "Need a quick summary.",
            timestamp: 1,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /From Human/i }),
    ).toBeInTheDocument();
  });

  it("shows readable labels for send tool targets", () => {
    const nodes = new Map<string, Node>([
      [
        "assistant",
        {
          id: "assistant",
          node_type: "assistant",
          graph_id: null,
          state: "idle",
          connections: [],
          name: null,
          todos: [],
          role_name: "Steward",
        },
      ],
    ]);

    render(
      <HistoryView
        history={[
          {
            type: "ToolCall",
            tool_name: "send",
            tool_call_id: "tool-1",
            arguments: { to: "assistant", content: "Done." },
            timestamp: 1,
          },
        ]}
        nodes={nodes}
      />,
    );

    expect(
      screen.getByRole("button", { name: /To Assistant/i }),
    ).toBeInTheDocument();
  });
});
