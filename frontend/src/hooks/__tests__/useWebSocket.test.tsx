import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocket } from "@/hooks/useWebSocket";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

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
}

const originalWebSocket = globalThis.WebSocket;

describe("useWebSocket", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
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
});
