import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/Sidebar";

const { useAgentConnectionRuntime, useAgentUI } = vi.hoisted(() => ({
  useAgentConnectionRuntime: vi.fn(),
  useAgentUI: vi.fn(),
}));

vi.mock("@/context/AgentContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AgentContext")>(
    "@/context/AgentContext",
  );
  return {
    ...actual,
    useAgentConnectionRuntime,
    useAgentUI,
  };
});

vi.mock("@/components/PanelResizer", () => ({
  PanelResizer: () => null,
}));

vi.mock("@/components/SidebarActivityTicker", () => ({
  SidebarActivityTicker: () => null,
}));

describe("Sidebar", () => {
  const setCurrentPage = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    setCurrentPage.mockReset();
    useAgentConnectionRuntime.mockReturnValue({ connected: true });
    useAgentUI.mockReturnValue({
      currentPage: "workspace",
      setCurrentPage,
    });
  });

  it("renders navigation items in the spec order", () => {
    render(<Sidebar width={232} onWidthChange={() => {}} />);

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      "Workspace",
      "Blueprints",
      "Providers",
      "Roles",
      "Prompts",
      "Tools",
      "Channels",
      "Stats",
      "Settings",
    ]);
  });

  it("navigates to the selected page", () => {
    const onNavigate = vi.fn();

    render(
      <Sidebar width={232} onWidthChange={() => {}} onNavigate={onNavigate} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stats" }));

    expect(setCurrentPage).toHaveBeenCalledWith("stats");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
