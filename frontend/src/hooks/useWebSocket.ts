import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { dispatchAccessDeniedEvent } from "@/lib/accessEvents";
import type { AgentEvent } from "@/types";

const INITIAL_DELAY = 1000;
const MAX_DELAY = 10000;

interface UseWebSocketOptions {
  onDisplayEvent: (event: AgentEvent) => void;
  onUpdateEvent: (event: AgentEvent) => void;
}

interface SocketChannelConfig {
  path: string;
  onMessage: MutableRefObject<(event: AgentEvent) => void>;
  setConnected: (connected: boolean) => void;
  onAccessDenied: () => void;
}

function isAccessSessionClose(event: CloseEvent) {
  const reason = event.reason.trim().toLowerCase();
  return (
    event.code === 4401 || (event.code === 4001 && reason.startsWith("access "))
  );
}

function createSocketChannel(
  { path, onMessage, setConnected, onAccessDenied }: SocketChannelConfig,
  isDisposed: () => boolean,
) {
  let retryDelay = INITIAL_DELAY;
  let retryTimer: number | null = null;
  let connectTimer: number | null = null;
  let wasConnected = false;
  let ws: WebSocket | null = null;

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const clearConnectTimer = () => {
    if (connectTimer !== null) {
      window.clearTimeout(connectTimer);
      connectTimer = null;
    }
  };

  const scheduleConnect = (delay = 0) => {
    clearConnectTimer();
    connectTimer = window.setTimeout(() => {
      connectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (isDisposed()) return;

    clearRetryTimer();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${window.location.host}${path}`);

    ws.onopen = () => {
      setConnected(true);
      retryDelay = INITIAL_DELAY;
      if (wasConnected) {
        toast.success(`Reconnected ${path}`);
      }
      wasConnected = true;
    };

    ws.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        onMessage.current(event);
      } catch {
        // ignore malformed events
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      ws = null;
      if (isAccessSessionClose(event)) {
        onAccessDenied();
        return;
      }
      if (isDisposed()) return;
      if (wasConnected) {
        toast.error(`Connection lost ${path}, reconnecting...`);
      }
      const delay = retryDelay;
      retryDelay = Math.min(delay * 2, MAX_DELAY);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        scheduleConnect();
      }, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  scheduleConnect();

  return () => {
    clearConnectTimer();
    clearRetryTimer();
    setConnected(false);
    ws?.close();
    ws = null;
  };
}

export function useWebSocket({
  onDisplayEvent,
  onUpdateEvent,
}: UseWebSocketOptions) {
  const [displayConnected, setDisplayConnected] = useState(false);
  const [updateConnected, setUpdateConnected] = useState(false);
  const onDisplayRef = useRef(onDisplayEvent);
  const onUpdateRef = useRef(onUpdateEvent);
  const accessDeniedDispatchedRef = useRef(false);

  useEffect(() => {
    onDisplayRef.current = onDisplayEvent;
  }, [onDisplayEvent]);

  useEffect(() => {
    onUpdateRef.current = onUpdateEvent;
  }, [onUpdateEvent]);

  useEffect(() => {
    let disposed = false;
    const handleAccessDenied = () => {
      if (accessDeniedDispatchedRef.current) {
        return;
      }
      accessDeniedDispatchedRef.current = true;
      dispatchAccessDeniedEvent();
    };

    const cleanups = [
      createSocketChannel(
        {
          path: "/ws/events",
          onMessage: onDisplayRef,
          setConnected: setDisplayConnected,
          onAccessDenied: handleAccessDenied,
        },
        () => disposed,
      ),
      createSocketChannel(
        {
          path: "/ws/updates",
          onMessage: onUpdateRef,
          setConnected: setUpdateConnected,
          onAccessDenied: handleAccessDenied,
        },
        () => disposed,
      ),
    ];

    return () => {
      disposed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);

  return { connected: displayConnected && updateConnected };
}
