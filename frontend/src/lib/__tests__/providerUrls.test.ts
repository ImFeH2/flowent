import { describe, expect, it } from "vitest";
import {
  buildProviderRequestPreview,
  resolveProviderBaseUrl,
} from "@/lib/providerUrls";

describe("providerUrls", () => {
  it("adds the missing version suffix before building an OpenAI Responses preview", () => {
    expect(
      buildProviderRequestPreview("openai_responses", "https://api.openai.com"),
    ).toEqual({
      previewUrl: "https://api.openai.com/v1/responses",
      error: null,
    });
  });

  it("keeps a matching Gemini version suffix without duplicating it", () => {
    expect(
      resolveProviderBaseUrl(
        "gemini",
        "https://generativelanguage.googleapis.com/v1beta",
      ),
    ).toEqual({
      resolvedBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      error: null,
    });
  });

  it("rejects a mismatched version suffix", () => {
    expect(
      buildProviderRequestPreview("gemini", "https://api.example.com/v1"),
    ).toEqual({
      previewUrl: null,
      error:
        "Base URL suffix '/v1' does not match type 'gemini' (expected '/v1beta')",
    });
  });
});
