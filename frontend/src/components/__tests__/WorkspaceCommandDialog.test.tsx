import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceCommandDialog,
  WorkspaceDialogField,
} from "@/components/WorkspaceCommandDialog";

afterEach(() => {
  cleanup();
});

describe("WorkspaceCommandDialog", () => {
  it("keeps long forms inside the viewport with a scrollable body region", () => {
    render(
      <WorkspaceCommandDialog
        open
        onOpenChange={vi.fn()}
        title="Create Task Tab"
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Create Task Tab</button>
          </>
        }
      >
        {Array.from({ length: 8 }, (_, index) => (
          <WorkspaceDialogField
            key={`field-${index}`}
            label={`Field ${index + 1}`}
          >
            <div className="h-24" />
          </WorkspaceDialogField>
        ))}
      </WorkspaceCommandDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Create Task Tab" });
    const body = screen.getByTestId("workspace-command-dialog-body");

    expect(dialog.className).toContain("max-h-[calc(100svh-2rem)]");
    expect(body.className).toContain("overflow-y-auto");
    expect(
      screen.getByRole("button", { name: "Create Task Tab" }),
    ).toBeVisible();
  }, 10000);
});
