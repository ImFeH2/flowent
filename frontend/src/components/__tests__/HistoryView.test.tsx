import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryView } from "@/components/HistoryView";
import type { HistoryEntry } from "@/types";

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

    render(<HistoryView history={history} agentLabel="Project Planner" />);

    expect(
      screen.getByRole("button", { name: /From agent-12/i }),
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
});
