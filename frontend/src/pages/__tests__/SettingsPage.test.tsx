import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and saves model metadata overrides and token-limit compact settings", async () => {
    fetchSettingsBootstrap.mockResolvedValue({
      settings: {
        assistant: {
          role_name: "Steward",
          allow_network: true,
          write_dirs: ["/workspace/project"],
        },
        leader: { role_name: "Conductor" },
        model: {
          active_provider_id: "",
          active_model: "gpt-5.2",
          input_image: null,
          output_image: null,
          capabilities: { input_image: true, output_image: false },
          context_window_tokens: null,
          resolved_context_window_tokens: 128000,
          timeout_ms: 10000,
          retry_policy: "limited",
          max_retries: 5,
          retry_initial_delay_seconds: 0.5,
          retry_max_delay_seconds: 8,
          retry_backoff_cap_retries: 5,
          auto_compact_token_limit: null,
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
      roles: [
        {
          name: "Steward",
          description: "Human-facing assistant role",
          system_prompt: "Default.",
          model: null,
          model_params: null,
          included_tools: [],
          excluded_tools: [],
          is_builtin: true,
        },
        {
          name: "Conductor",
          description: "Default leader role",
          system_prompt: "Lead.",
          model: null,
          model_params: null,
          included_tools: [],
          excluded_tools: [],
          is_builtin: true,
        },
      ],
      version: "1.2.3",
    });
    saveSettings.mockResolvedValue({
      assistant: {
        role_name: "Steward",
        allow_network: false,
        write_dirs: ["/workspace/tmp"],
      },
      leader: { role_name: "Conductor" },
      model: {
        active_provider_id: "",
        active_model: "gpt-5.2",
        input_image: true,
        output_image: false,
        capabilities: { input_image: true, output_image: false },
        context_window_tokens: 64000,
        resolved_context_window_tokens: 64000,
        timeout_ms: 15000,
        retry_policy: "limited",
        max_retries: 5,
        retry_initial_delay_seconds: 0.75,
        retry_max_delay_seconds: 8,
        retry_backoff_cap_retries: 5,
        auto_compact_token_limit: 48000,
        params: {
          reasoning_effort: null,
          verbosity: null,
          max_output_tokens: null,
          temperature: null,
          top_p: null,
        },
      },
    });

    render(<SettingsPage />);

    const timeoutInput = await screen.findByLabelText("Request Timeout");
    const initialDelayInput = screen.getByLabelText("Initial Delay");
    const contextWindowInput = screen.getByLabelText("Context Window");
    const inputImageSelect = screen.getByRole("combobox", {
      name: /Input Image/i,
    });
    const outputImageSelect = screen.getByRole("combobox", {
      name: /Output Image/i,
    });
    const autoCompactTokenLimitInput = screen.getByLabelText(
      "Automatic Compact Token Limit",
    );
    const networkAccessSwitch = screen.getByRole("switch", {
      name: "Network Access",
    });
    const writeDirsTextarea = screen.getByLabelText("Write Dirs");

    expect(timeoutInput).toHaveValue("10000");
    expect(screen.getByText("ms")).toBeInTheDocument();
    expect(initialDelayInput).toHaveValue("0.5");
    expect(contextWindowInput).toHaveValue("");
    expect(autoCompactTokenLimitInput).toHaveValue("");
    expect(writeDirsTextarea).toHaveValue("/workspace/project");
    expect(screen.getByText("Context window: 128,000")).toBeInTheDocument();
    expect(
      screen.getByText("Capabilities: input_image=true, output_image=false"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Human-facing assistant role").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Default leader role").length).toBeGreaterThan(
      0,
    );

    fireEvent.change(timeoutInput, { target: { value: "15000" } });
    fireEvent.change(initialDelayInput, { target: { value: "0.75" } });
    fireEvent.change(contextWindowInput, { target: { value: "64000" } });
    fireEvent.click(inputImageSelect);
    fireEvent.click(screen.getByRole("option", { name: "Enabled" }));
    fireEvent.click(outputImageSelect);
    fireEvent.click(screen.getByRole("option", { name: "Disabled" }));
    fireEvent.change(autoCompactTokenLimitInput, {
      target: { value: "48000" },
    });
    fireEvent.click(networkAccessSwitch);
    fireEvent.change(writeDirsTextarea, {
      target: { value: " ./tmp \n./tmp/\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({
        assistant: {
          role_name: "Steward",
          allow_network: false,
          write_dirs: ["./tmp"],
        },
        leader: { role_name: "Conductor" },
        model: {
          active_provider_id: "",
          active_model: "gpt-5.2",
          input_image: true,
          output_image: false,
          context_window_tokens: 64000,
          timeout_ms: 15000,
          retry_policy: "limited",
          max_retries: 5,
          retry_initial_delay_seconds: 0.75,
          retry_max_delay_seconds: 8,
          retry_backoff_cap_retries: 5,
          auto_compact_token_limit: 48000,
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
  }, 10000);

  it("blocks saving a compact token limit that reaches the known safe window", async () => {
    fetchSettingsBootstrap.mockResolvedValue({
      settings: {
        assistant: {
          role_name: "Steward",
          allow_network: true,
          write_dirs: ["/workspace/project"],
        },
        leader: { role_name: "Conductor" },
        model: {
          active_provider_id: "",
          active_model: "gpt-5.2",
          input_image: null,
          output_image: null,
          capabilities: { input_image: true, output_image: false },
          context_window_tokens: null,
          resolved_context_window_tokens: 128000,
          timeout_ms: 10000,
          retry_policy: "limited",
          max_retries: 5,
          retry_initial_delay_seconds: 0.5,
          retry_max_delay_seconds: 8,
          retry_backoff_cap_retries: 5,
          auto_compact_token_limit: null,
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
      roles: [
        {
          name: "Steward",
          description: "Human-facing assistant role",
          system_prompt: "Default.",
          model: null,
          model_params: null,
          included_tools: [],
          excluded_tools: [],
          is_builtin: true,
        },
        {
          name: "Conductor",
          description: "Default leader role",
          system_prompt: "Lead.",
          model: null,
          model_params: null,
          included_tools: [],
          excluded_tools: [],
          is_builtin: true,
        },
      ],
      version: "1.2.3",
    });

    render(<SettingsPage />);

    const autoCompactTokenLimitInput = await screen.findByLabelText(
      "Automatic Compact Token Limit",
    );

    fireEvent.change(autoCompactTokenLimitInput, {
      target: { value: "126976" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(saveSettings).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Automatic Compact token limit must stay below the known safe input window",
    );
  });
});
