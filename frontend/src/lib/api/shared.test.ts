import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/api/shared";

const { dispatchAccessDeniedEventMock } = vi.hoisted(() => ({
  dispatchAccessDeniedEventMock: vi.fn(),
}));

vi.mock("@/lib/accessEvents", () => ({
  dispatchAccessDeniedEvent: (...args: unknown[]) =>
    dispatchAccessDeniedEventMock(...args),
}));

describe("requestJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches access denied when a protected API returns 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Access denied" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(
      requestJson("/api/settings/bootstrap", {
        errorMessage: "Failed to fetch bootstrap",
      }),
    ).rejects.toThrow("Failed to fetch bootstrap: Access denied");

    expect(dispatchAccessDeniedEventMock).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch access denied for /api/access endpoints", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid access code" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(
      requestJson("/api/access/login", {
        method: "POST",
        body: { code: "bad-code" },
        errorMessage: "Failed to verify access code",
      }),
    ).rejects.toThrow("Failed to verify access code: Invalid access code");

    expect(dispatchAccessDeniedEventMock).not.toHaveBeenCalled();
  });
});
