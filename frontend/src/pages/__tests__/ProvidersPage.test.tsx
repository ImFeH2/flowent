import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ProvidersPage } from "@/pages/ProvidersPage";
import type { Provider } from "@/types";

const {
  createProviderMock,
  deleteProviderMock,
  fetchProviderCatalogPreviewMock,
  fetchProvidersMock,
  testProviderModelRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateProviderMock,
} = vi.hoisted(() => ({
  createProviderMock: vi.fn(),
  deleteProviderMock: vi.fn(),
  fetchProviderCatalogPreviewMock: vi.fn(),
  fetchProvidersMock: vi.fn(),
  testProviderModelRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateProviderMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createProvider: (...args: unknown[]) => createProviderMock(...args),
  deleteProvider: (...args: unknown[]) => deleteProviderMock(...args),
  fetchProviderCatalogPreview: (...args: unknown[]) =>
    fetchProviderCatalogPreviewMock(...args),
  fetchProviders: (...args: unknown[]) => fetchProvidersMock(...args),
  testProviderModelRequest: (...args: unknown[]) =>
    testProviderModelRequestMock(...args),
  updateProvider: (...args: unknown[]) => updateProviderMock(...args),
}));

vi.mock("@/hooks/usePanelDrag", () => ({
  usePanelDrag: () => ({
    isDragging: false,
    startDrag: vi.fn(),
  }),
  usePanelWidth: () => [300, vi.fn()],
}));

vi.mock("@/components/PanelResizer", () => ({
  PanelResizer: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

function buildProvider(
  overrides: Partial<Provider> & Pick<Provider, "id" | "name">,
): Provider {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type ?? "openai_compatible",
    base_url: overrides.base_url ?? "https://api.example.com/v1",
    api_key: overrides.api_key ?? "",
    headers: overrides.headers ?? {},
    retry_429_delay_seconds: overrides.retry_429_delay_seconds ?? 0,
    models: overrides.models ?? [],
  };
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ProvidersPage />
    </SWRConfig>,
  );
}

describe("ProvidersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches provider models into the draft and saves the merged catalog", async () => {
    fetchProvidersMock.mockResolvedValue([
      buildProvider({ id: "provider-1", name: "Primary" }),
    ]);
    fetchProviderCatalogPreviewMock.mockResolvedValue([
      {
        model: "gpt-5",
        source: "discovered",
        context_window_tokens: 128000,
        input_image: true,
        output_image: false,
      },
    ]);
    updateProviderMock.mockResolvedValue(
      buildProvider({
        id: "provider-1",
        name: "Primary",
        models: [
          {
            model: "gpt-5",
            source: "discovered",
            context_window_tokens: 128000,
            input_image: true,
            output_image: false,
          },
          {
            model: "manual-model",
            source: "manual",
            context_window_tokens: null,
            input_image: null,
            output_image: null,
          },
        ],
      }),
    );

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Primary/i }));
    fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

    await screen.findByText("gpt-5");
    expect(fetchProviderCatalogPreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_id: "provider-1",
        type: "openai_compatible",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Model ID"), {
      target: { value: "manual-model" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Model" }));

    await screen.findByText("manual-model");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateProviderMock).toHaveBeenCalledWith(
        "provider-1",
        expect.objectContaining({
          models: [
            expect.objectContaining({
              model: "gpt-5",
              source: "discovered",
            }),
            expect.objectContaining({
              model: "manual-model",
              source: "manual",
            }),
          ],
        }),
      ),
    );
  }, 10000);

  it("shows inline model test feedback for the current provider draft", async () => {
    fetchProvidersMock.mockResolvedValue([
      buildProvider({
        id: "provider-1",
        name: "Primary",
        models: [
          {
            model: "gpt-5",
            source: "discovered",
            context_window_tokens: 128000,
            input_image: true,
            output_image: false,
          },
        ],
      }),
    ]);
    testProviderModelRequestMock.mockResolvedValue({
      ok: true,
      duration_ms: 321,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Primary/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);

    expect(testProviderModelRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_id: "provider-1",
        model: "gpt-5",
      }),
    );
    expect(
      await screen.findByText("Test succeeded in 321ms"),
    ).toBeInTheDocument();
  });
});
