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
        content: "请检查当前目录。",
        timestamp: 1,
      },
      {
        type: "AssistantText",
        content: "当前目录包含 frontend、app 和 tests。",
        timestamp: 2,
      },
    ];

    render(<HistoryView history={history} />);

    expect(
      screen.getByRole("button", { name: /From agent-12/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Assistant/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("请检查当前目录。")).not.toBeInTheDocument();
    expect(
      screen.queryByText("当前目录包含 frontend、app 和 tests。"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Assistant/i }));

    expect(
      screen.getByText("当前目录包含 frontend、app 和 tests。"),
    ).toBeInTheDocument();
  });
});
