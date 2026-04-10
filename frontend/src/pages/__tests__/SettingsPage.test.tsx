import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/pages/SettingsPage";

const {
  fetchProviderModels,
  fetchSettingsBootstrap,
  saveSettings,
  toastError,
  toastSuccess,
} = vi.hoisted(() => ({
  fetchProviderModels: vi.fn(),
  fetchSettingsBootstrap: vi.fn(),
  saveSettings: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchProviderModels,
  fetchSettingsBootstrap,
  saveSettings,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

describe("SettingsPage", () => {
  it("loads and saves request timeout", async () => {
    fetchSettingsBootstrap.mockResolvedValue({
      settings: {
        assistant: { role_name: "Steward" },
        leader: { role_name: "Conductor" },
        model: {
          active_provider_id: "",
          active_model: "",
          timeout_ms: 10000,
          retry_policy: "limited",
          max_retries: 5,
          retry_initial_delay_seconds: 0.5,
          retry_max_delay_seconds: 8,
          retry_backoff_cap_retries: 5,
          params: {
            reasoning_effort: null,
            verbosity: null,
            max_output_tokens: null,
            temperature: null,
            top_p: null,
          },
        },
      },
      providers: [],
      roles: [{ name: "Steward", system_prompt: "Default.", is_builtin: true }],
      version: "1.2.3",
    });
    saveSettings.mockResolvedValue(undefined);

    render(<SettingsPage />);

    const timeoutInput = await screen.findByLabelText("Request Timeout");
    const initialDelayInput = screen.getByLabelText("Initial Delay");

    expect(timeoutInput).toHaveValue("10000");
    expect(screen.getByText("ms")).toBeInTheDocument();
    expect(initialDelayInput).toHaveValue("0.5");

    fireEvent.change(timeoutInput, { target: { value: "15000" } });
    fireEvent.change(initialDelayInput, { target: { value: "0.75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({
        assistant: { role_name: "Steward" },
        leader: { role_name: "Conductor" },
        model: {
          active_provider_id: "",
          active_model: "",
          timeout_ms: 15000,
          retry_policy: "limited",
          max_retries: 5,
          retry_initial_delay_seconds: 0.75,
          retry_max_delay_seconds: 8,
          retry_backoff_cap_retries: 5,
          params: {
            reasoning_effort: null,
            verbosity: null,
            max_output_tokens: null,
            temperature: null,
            top_p: null,
          },
        },
      }),
    );

    expect(toastSuccess).toHaveBeenCalledWith("Settings saved");
    expect(toastError).not.toHaveBeenCalled();
    expect(fetchProviderModels).not.toHaveBeenCalled();
  });
});
