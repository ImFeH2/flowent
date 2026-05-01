import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageScaffold } from "@/components/layout/PageScaffold";

describe("PageScaffold", () => {
  it("passes the remaining page height to the child page root container", () => {
    render(
      <PageScaffold>
        <div data-testid="page-root" className="flex min-h-0 flex-1" />
      </PageScaffold>,
    );

    const pageRoot = screen.getByTestId("page-root");
    expect(pageRoot).toHaveClass("flex-1");
    expect(pageRoot.parentElement).toHaveClass(
      "flex",
      "h-full",
      "flex-col",
      "min-h-0",
      "overflow-hidden",
    );
  });
});
