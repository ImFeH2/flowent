import { describe, expect, it } from "vitest";
import {
  formatProviderHeaders,
  parseProviderHeadersInput,
} from "@/lib/providerHeaders";

describe("providerHeaders", () => {
  it("formats empty headers as blank input", () => {
    expect(formatProviderHeaders({})).toBe("");
  });

  it("formats and parses a headers object", () => {
    const formatted = formatProviderHeaders({
      Authorization: "Bearer test",
      "X-Test": "value",
    });

    expect(parseProviderHeadersInput(formatted)).toEqual({
      headers: {
        Authorization: "Bearer test",
        "X-Test": "value",
      },
      error: null,
    });
  });

  it("rejects non-object JSON", () => {
    expect(parseProviderHeadersInput('["bad"]')).toEqual({
      headers: {},
      error: "Headers must be a JSON object",
    });
  });

  it("rejects non-string header values", () => {
    expect(parseProviderHeadersInput('{"X-Test":1}')).toEqual({
      headers: {},
      error: "Headers values must all be strings",
    });
  });
});
