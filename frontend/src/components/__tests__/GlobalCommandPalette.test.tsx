import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";

describe("GlobalCommandPalette", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("routes page and workflow selections through the shared palette", async () => {
    class ResizeObserverMock {
      disconnect() {}
      observe() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    const onOpenChange = vi.fn();
    const onSelectPage = vi.fn();
    const onSelectWorkflow = vi.fn();

    render(
      <GlobalCommandPalette
        open
        onOpenChange={onOpenChange}
        onSelectPage={onSelectPage}
        onSelectWorkflow={onSelectWorkflow}
        workflows={[
          {
            id: "workflow-12345678",
            shortId: "workflow",
            title: "Design Review",
          },
        ]}
      />,
    );

    fireEvent.click(await screen.findByText("Providers"));
    expect(onSelectPage).toHaveBeenCalledWith("providers");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByText("Design Review"));
    expect(onSelectWorkflow).toHaveBeenCalledWith("workflow-12345678");
  });
});
