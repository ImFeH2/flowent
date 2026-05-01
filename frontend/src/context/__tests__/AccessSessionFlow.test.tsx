import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessProvider } from "@/context/AccessContext";
import { useAccess } from "@/context/useAccess";
import { useWebSocket } from "@/hooks/useWebSocket";
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

function SocketShell() {
  useWebSocket({
    onDisplayEvent: vi.fn(),
    onUpdateEvent: vi.fn(),
  });
  return <div>Admin Shell</div>;
}

function AccessSessionHarness() {
  const { loading, state } = useAccess();

  if (loading) {
    return <div>Loading access...</div>;
  }

  if (!state.authenticated) {
    return <div>Enter Access Code</div>;
  }

  return <SocketShell />;
}

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

describe("access session flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockWebSocket.instances.splice(0, MockWebSocket.instances.length);
    fetchAccessState.mockResolvedValue(AUTHENTICATED_STATE);
    loginAccess.mockResolvedValue(AUTHENTICATED_STATE);
    logoutAccess.mockResolvedValue(UNAUTHENTICATED_STATE);
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
  });

  it("returns to the access gate when the backend closes a websocket for session invalidation", async () => {
    const refreshRequest = createDeferred<AccessState>();
    fetchAccessState
      .mockResolvedValueOnce(AUTHENTICATED_STATE)
      .mockImplementationOnce(() => refreshRequest.promise);

    render(
      <AccessWrapper>
        <AccessSessionHarness />
      </AccessWrapper>,
    );

    await flushEffects();

    expect(screen.getByText("Admin Shell")).toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(2);

    act(() => {
      MockWebSocket.instances[0]?.emitOpen();
      MockWebSocket.instances[0]?.emitClose({
        code: 4001,
        reason: "Access session updated",
      });
    });

    expect(screen.getByText("Enter Access Code")).toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(2);

    await act(async () => {
      refreshRequest.resolve(UNAUTHENTICATED_STATE);
      await refreshRequest.promise;
    });

    expect(screen.getByText("Enter Access Code")).toBeInTheDocument();
  });
});
