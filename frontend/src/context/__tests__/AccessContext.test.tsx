import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessProvider } from "@/context/AccessContext";
import { useAccess } from "@/context/useAccess";
import { dispatchAccessDeniedEvent } from "@/lib/accessEvents";
import type { AccessState } from "@/types";

const { fetchAccessState, loginAccess, logoutAccess } = vi.hoisted(() => ({
  fetchAccessState: vi.fn(),
  loginAccess: vi.fn(),
  logoutAccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchAccessState,
  loginAccess,
  logoutAccess,
}));

const AUTHENTICATED_STATE: AccessState = {
  authenticated: true,
  configured: true,
  bootstrap_generated: false,
  requires_restart: false,
};

const UNAUTHENTICATED_STATE: AccessState = {
  authenticated: false,
  configured: true,
  bootstrap_generated: false,
  requires_restart: false,
};

function AccessWrapper({ children }: { children: ReactNode }) {
  return <AccessProvider>{children}</AccessProvider>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AccessProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchAccessState.mockResolvedValue(AUTHENTICATED_STATE);
    loginAccess.mockResolvedValue(AUTHENTICATED_STATE);
    logoutAccess.mockResolvedValue(UNAUTHENTICATED_STATE);
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("does not poll access state after the initial authenticated load", async () => {
    const { result } = renderHook(() => useAccess(), {
      wrapper: AccessWrapper,
    });

    await flushEffects();

    expect(result.current.loading).toBe(false);
    expect(result.current.state.authenticated).toBe(true);
    expect(fetchAccessState).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(15000);
      window.dispatchEvent(new Event("focus"));
    });

    expect(fetchAccessState).toHaveBeenCalledTimes(1);
  });

  it("immediately exits the authenticated shell when access is denied", async () => {
    const refreshRequest = createDeferred<AccessState>();
    fetchAccessState
      .mockResolvedValueOnce(AUTHENTICATED_STATE)
      .mockImplementationOnce(() => refreshRequest.promise);

    const { result } = renderHook(() => useAccess(), {
      wrapper: AccessWrapper,
    });

    await flushEffects();

    expect(result.current.state.authenticated).toBe(true);

    act(() => {
      dispatchAccessDeniedEvent();
    });

    expect(result.current.state.authenticated).toBe(false);
    expect(fetchAccessState).toHaveBeenCalledTimes(2);

    await act(async () => {
      refreshRequest.resolve(UNAUTHENTICATED_STATE);
      await refreshRequest.promise;
    });

    expect(result.current.state.authenticated).toBe(false);
  });
});
