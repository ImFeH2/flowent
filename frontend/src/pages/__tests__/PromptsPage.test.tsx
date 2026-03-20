import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptsPage } from "@/pages/PromptsPage";

const { fetchPromptSettings, savePromptSettings, toastSuccess, toastError } =
  vi.hoisted(() => ({
    fetchPromptSettings: vi.fn(),
    savePromptSettings: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }));

vi.mock("@/lib/api", () => ({
  fetchPromptSettings,
  savePromptSettings,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

describe("PromptsPage", () => {
  it("loads and saves both prompt layers", async () => {
    fetchPromptSettings.mockResolvedValue({
      custom_prompt: "Be concise.",
      post_prompt: "Use @target: for routed messages.",
    });
    savePromptSettings.mockResolvedValue({
      custom_prompt: "Stay precise.",
      post_prompt: "Call idle when done.",
    });

    render(<PromptsPage />);

    const customPrompt = await screen.findByLabelText("Custom Prompt");
    const postPrompt = screen.getByLabelText("Post Prompt");

    expect(customPrompt).toHaveValue("Be concise.");
    expect(postPrompt).toHaveValue("Use @target: for routed messages.");

    fireEvent.change(customPrompt, { target: { value: "Stay precise." } });
    fireEvent.change(postPrompt, { target: { value: "Call idle when done." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(savePromptSettings).toHaveBeenCalledWith({
        custom_prompt: "Stay precise.",
        post_prompt: "Call idle when done.",
      }),
    );

    expect(toastSuccess).toHaveBeenCalledWith("Prompts saved");
    expect(toastError).not.toHaveBeenCalled();
  });
});
