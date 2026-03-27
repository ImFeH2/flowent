import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarActivityTicker } from "@/components/SidebarActivityTicker";
import type { ActivityFeedEntry } from "@/context/AgentFeedContext";
import type { Node } from "@/types";

const { useAgentNodesRuntime, useAgentFeedRuntime } = vi.hoisted(() => ({
  useAgentNodesRuntime: vi.fn(),
  useAgentFeedRuntime: vi.fn(),
}));

vi.mock("@/context/AgentContext", () => ({
  useAgentNodesRuntime,
}));

vi.mock("@/context/AgentFeedContext", async () => {
  const actual = await vi.importActual<
    typeof import("@/context/AgentFeedContext")
  >("@/context/AgentFeedContext");
  return {
    ...actual,
    useAgentFeedRuntime,
  };
});

describe("SidebarActivityTicker", () => {
  it("shows idle duration when the idle tool result is available", () => {
    const agents = new Map<string, Node>([
      [
        "agent-1",
        {
          id: "agent-1",
          node_type: "agent",
          state: "idle",
          connections: [],
          name: "Project Analyst",
          todos: [],
          role_name: "Worker",
        },
      ],
    ]);
    const recentActivities: ActivityFeedEntry[] = [
      {
        id: "activity-1",
        agentId: "agent-1",
        timestampMs: Date.now(),
        entry: {
          type: "ToolCall",
          tool_name: "idle",
          tool_call_id: "idle-1",
          arguments: {},
          result: "idle 1.25s",
          timestamp: Date.now() / 1000,
        },
      },
    ];

    useAgentNodesRuntime.mockReturnValue({ agents });
    useAgentFeedRuntime.mockReturnValue({ recentActivities });

    render(<SidebarActivityTicker width={260} />);

    expect(screen.getByText(/Project Analyst idle 1.25s/i)).toBeInTheDocument();
  });

  it("shows sleep duration when the sleep tool result is available", () => {
    const agents = new Map<string, Node>([
      [
        "agent-1",
        {
          id: "agent-1",
          node_type: "agent",
          state: "running",
          connections: [],
          name: "Project Analyst",
          todos: [],
          role_name: "Worker",
        },
      ],
    ]);
    const recentActivities: ActivityFeedEntry[] = [
      {
        id: "activity-2",
        agentId: "agent-1",
        timestampMs: Date.now(),
        entry: {
          type: "ToolCall",
          tool_name: "sleep",
          tool_call_id: "sleep-1",
          arguments: { seconds: 0.5 },
          result: "slept 0.50s",
          timestamp: Date.now() / 1000,
        },
      },
    ];

    useAgentNodesRuntime.mockReturnValue({ agents });
    useAgentFeedRuntime.mockReturnValue({ recentActivities });

    render(<SidebarActivityTicker width={260} />);

    expect(
      screen.getByText(/Project Analyst slept 0.50s/i),
    ).toBeInTheDocument();
  });
});
