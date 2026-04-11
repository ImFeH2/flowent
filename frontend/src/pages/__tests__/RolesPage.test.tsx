import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RolesPage } from "@/pages/RolesPage";

const {
  createRoleMock,
  deleteRoleMock,
  fetchProviderModelsMock,
  fetchRolesBootstrapMock,
  updateRoleMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  createRoleMock: vi.fn(),
  deleteRoleMock: vi.fn(),
  fetchProviderModelsMock: vi.fn(),
  fetchRolesBootstrapMock: vi.fn(),
  updateRoleMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createRole: (...args: unknown[]) => createRoleMock(...args),
  deleteRole: (...args: unknown[]) => deleteRoleMock(...args),
  fetchProviderModels: (...args: unknown[]) => fetchProviderModelsMock(...args),
  fetchRolesBootstrap: (...args: unknown[]) => fetchRolesBootstrapMock(...args),
  updateRole: (...args: unknown[]) => updateRoleMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

describe("RolesPage", () => {
  it("shows role descriptions in the list", async () => {
    fetchRolesBootstrapMock.mockResolvedValue({
      roles: [
        {
          name: "Reviewer",
          description: "Review code and validate risky changes.",
          system_prompt: "Review carefully.",
          model: null,
          model_params: null,
          included_tools: ["read"],
          excluded_tools: ["fetch"],
          is_builtin: false,
        },
      ],
      tools: [],
      providers: [],
    });

    render(<RolesPage />);

    expect(
      await screen.findByText("Review code and validate risky changes."),
    ).toBeInTheDocument();
  });

  it("requires a description before enabling role creation", async () => {
    fetchRolesBootstrapMock.mockResolvedValue({
      roles: [
        {
          name: "Worker",
          description: "General execution role.",
          system_prompt: "Do work.",
          model: null,
          model_params: null,
          included_tools: ["read", "exec"],
          excluded_tools: [],
          is_builtin: true,
        },
      ],
      tools: [],
      providers: [],
    });

    render(<RolesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "New Role" }));

    const createButton = screen.getByRole("button", { name: "Create Role" });
    fireEvent.change(screen.getByPlaceholderText("e.g., Code Reviewer"), {
      target: { value: "Architect" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("You are a helpful assistant that..."),
      {
        target: { value: "Design systems carefully." },
      },
    );

    expect(createButton).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText(
        "Briefly explain what this role is best suited for",
      ),
      {
        target: { value: "Design systems and architecture." },
      },
    );

    await waitFor(() => expect(createButton).toBeEnabled());
  });
});
