import { describe, expect, it } from "vitest";
import {
  buildProviderDraftRequestPayload,
  buildProviderModelEntry,
  createProviderDraft,
  findDuplicateModelId,
  mergeFetchedModelsIntoDraft,
  validateProviderModelEditorDraft,
} from "@/pages/providers/lib";
import type { Provider, ProviderModelCatalogEntry } from "@/types";

function buildProvider(
  overrides: Partial<Provider> & Pick<Provider, "id" | "name">,
): Provider {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type ?? "openai_compatible",
    base_url: overrides.base_url ?? "https://api.example.com/v1",
    api_key: overrides.api_key ?? "secret",
    headers: overrides.headers ?? { Authorization: "Bearer secret" },
    retry_429_delay_seconds: overrides.retry_429_delay_seconds ?? 0,
    models: overrides.models ?? [],
  };
}

function buildModel(
  overrides: Partial<ProviderModelCatalogEntry> &
    Pick<ProviderModelCatalogEntry, "model">,
): ProviderModelCatalogEntry {
  return {
    model: overrides.model,
    source: overrides.source ?? "discovered",
    context_window_tokens:
      "context_window_tokens" in overrides
        ? (overrides.context_window_tokens ?? null)
        : 128000,
    input_image:
      "input_image" in overrides ? (overrides.input_image ?? null) : true,
    output_image:
      "output_image" in overrides ? (overrides.output_image ?? null) : false,
  };
}

describe("providers lib", () => {
  it("creates a draft from a saved provider", () => {
    const provider = buildProvider({
      id: "provider-1",
      name: "Primary",
      models: [buildModel({ model: "gpt-5" })],
    });

    const draft = createProviderDraft(provider);

    expect(draft.name).toBe("Primary");
    expect(draft.headers_text).toContain("Authorization");
    expect(draft.models).toEqual([buildModel({ model: "gpt-5" })]);
  });

  it("merges fetched models into manual entries without losing manual overrides", () => {
    const merged = mergeFetchedModelsIntoDraft(
      [
        buildModel({
          model: "gpt-5",
          source: "manual",
          context_window_tokens: null,
          input_image: null,
          output_image: null,
        }),
      ],
      [
        buildModel({
          model: "gpt-5",
          source: "discovered",
          context_window_tokens: 200000,
          input_image: true,
          output_image: false,
        }),
        buildModel({ model: "gpt-5-mini" }),
      ],
    );

    expect(merged).toEqual([
      {
        model: "gpt-5",
        source: "manual",
        context_window_tokens: 200000,
        input_image: true,
        output_image: false,
      },
      buildModel({ model: "gpt-5-mini" }),
    ]);
  });

  it("finds duplicate model ids after trimming whitespace", () => {
    const duplicate = findDuplicateModelId([
      buildModel({ model: "gpt-5" }),
      buildModel({ model: " gpt-5 " }),
    ]);

    expect(duplicate).toBe("gpt-5");
  });

  it("validates and builds provider model editor entries", () => {
    expect(
      validateProviderModelEditorDraft({
        model: "  ",
        source: "manual",
        context_window_tokens: "",
        input_image: "auto",
        output_image: "auto",
      }),
    ).toBe("Model ID is required");

    expect(
      buildProviderModelEntry({
        model: " gpt-5 ",
        source: "manual",
        context_window_tokens: "64000",
        input_image: "enabled",
        output_image: "disabled",
      }),
    ).toEqual({
      model: "gpt-5",
      source: "manual",
      context_window_tokens: 64000,
      input_image: true,
      output_image: false,
    });
  });

  it("builds provider draft request payloads for preview calls", () => {
    const draft = createProviderDraft(
      buildProvider({
        id: "provider-1",
        name: "Primary",
      }),
    );

    const payload = buildProviderDraftRequestPayload(
      draft,
      { Authorization: "Bearer updated" },
      "provider-1",
    );

    expect(payload).toEqual({
      provider_id: "provider-1",
      name: "Primary",
      type: "openai_compatible",
      base_url: "https://api.example.com/v1",
      api_key: "secret",
      headers: { Authorization: "Bearer updated" },
      retry_429_delay_seconds: 0,
    });
  });
});
