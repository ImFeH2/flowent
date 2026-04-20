import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecretInput, formHelpTextClass } from "@/components/form/FormControls";
import { PageLoadingState } from "@/components/layout/PageLoadingState";

describe("FormControls", () => {
  it("toggles secret inputs between masked and plain text", () => {
    render(
      <SecretInput
        aria-label="API Key"
        value="secret-value"
        onChange={() => {}}
        showLabel="Show API key"
        hideLabel="Hide API key"
      />,
    );

    const input = screen.getByLabelText("API Key");

    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show API key" }));

    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Hide API key" }));

    expect(input).toHaveAttribute("type", "password");
  });

  it("renders page loading state labels with shared styling", () => {
    render(
      <PageLoadingState
        label="Loading shared UI..."
        textClassName={formHelpTextClass}
      />,
    );

    expect(screen.getByText("Loading shared UI...")).toHaveClass(
      "text-muted-foreground",
    );
  });
});
