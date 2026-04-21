import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocket } from "@/hooks/useWebSocket";

const { toastSuccessMock, toastErrorMock, dispatchAccessDeniedEventMock } =
  vi.hoisted(() => ({
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    dispatchAccessDeniedEventMock: vi.fn(),
  }));

function expectedSocketUrls() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return [
    `${protocol}//${window.location.host}/ws/events`,
    `${protocol}//${window.location.host}/ws/updates`,
  ];
}

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/lib/accessEvents", () => ({
  dispatchAccessDeniedEvent: (...args: unknown[]) =>
    dispatchAccessDeniedEventMock(...args),
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  emitClose({ code = 1000, reason = "" }: { code?: number; reason?: string }) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

const originalWebSocket = globalThis.WebSocket;

describe("useWebSocket", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    dispatchAccessDeniedEventMock.mockReset();
    MockWebSocket.instances.splice(0, MockWebSocket.instances.length);
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
  });

  it("defers socket creation until the scheduled tick", () => {
    renderHook(() =>
      useWebSocket({
        onDisplayEvent: vi.fn(),
        onUpdateEvent: vi.fn(),
      }),
    );

    expect(MockWebSocket.instances).toHaveLength(0);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances.map((instance) => instance.url)).toEqual(
      expectedSocketUrls(),
    );
  });

  it("cancels scheduled startup when unmounted before the timer fires", () => {
    const { unmount } = renderHook(() =>
      useWebSocket({
        onDisplayEvent: vi.fn(),
        onUpdateEvent: vi.fn(),
      }),
    );

    unmount();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("creates only one socket pair under StrictMode and reports connected after both open", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const { result } = renderHook(
      () =>
        useWebSocket({
          onDisplayEvent: vi.fn(),
          onUpdateEvent: vi.fn(),
        }),
      { wrapper },
    );

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances.map((instance) => instance.url)).toEqual(
      expectedSocketUrls(),
    );
    expect(result.current.connected).toBe(false);

    act(() => {
      for (const instance of MockWebSocket.instances) {
        instance.emitOpen();
      }
    });

    expect(result.current.connected).toBe(true);
  });

  it.each([
    { code: 4001, reason: "Access code rotated" },
    { code: 4401, reason: "Access denied" },
  ])(
    "treats access-session socket closes as immediate reauth instead of reconnecting ($reason)",
    ({ code, reason }) => {
      renderHook(() =>
        useWebSocket({
          onDisplayEvent: vi.fn(),
          onUpdateEvent: vi.fn(),
        }),
      );

      act(() => {
        vi.runOnlyPendingTimers();
      });

      const [eventsSocket] = MockWebSocket.instances;

      act(() => {
        eventsSocket?.emitOpen();
        eventsSocket?.emitClose({ code, reason });
      });

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(dispatchAccessDeniedEventMock).toHaveBeenCalledTimes(1);
      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(MockWebSocket.instances).toHaveLength(2);
    },
  );

  it("keeps the shell in reconnect flow for normal backend disconnects", () => {
    const { result } = renderHook(() =>
      useWebSocket({
        onDisplayEvent: vi.fn(),
        onUpdateEvent: vi.fn(),
      }),
    );

    act(() => {
      vi.runOnlyPendingTimers();
    });

    act(() => {
      for (const instance of MockWebSocket.instances) {
        instance.emitOpen();
      }
    });

    expect(result.current.connected).toBe(true);

    act(() => {
      MockWebSocket.instances[0]?.emitClose({
        code: 1012,
        reason: "Service restart",
      });
    });

    expect(result.current.connected).toBe(false);
    expect(dispatchAccessDeniedEventMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runOnlyPendingTimers();
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(3);
  });
});
