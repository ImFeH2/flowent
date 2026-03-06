import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
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
}

function createSocketChannel(
  { path, onMessage, setConnected }: SocketChannelConfig,
  isDisposed: () => boolean,
) {
  let retryDelay = INITIAL_DELAY;
  let retryTimer: number | null = null;
  let wasConnected = false;
  let ws: WebSocket | null = null;

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
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

    ws.onclose = () => {
      setConnected(false);
      ws = null;
      if (isDisposed()) return;
      if (wasConnected) {
        toast.error(`Connection lost ${path}, reconnecting...`);
      }
      const delay = retryDelay;
      retryDelay = Math.min(delay * 2, MAX_DELAY);
      retryTimer = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return () => {
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

  useEffect(() => {
    onDisplayRef.current = onDisplayEvent;
  }, [onDisplayEvent]);

  useEffect(() => {
    onUpdateRef.current = onUpdateEvent;
  }, [onUpdateEvent]);

  useEffect(() => {
    let disposed = false;

    const cleanups = [
      createSocketChannel(
        {
          path: "/ws/events",
          onMessage: onDisplayRef,
          setConnected: setDisplayConnected,
        },
        () => disposed,
      ),
      createSocketChannel(
        {
          path: "/ws/updates",
          onMessage: onUpdateRef,
          setConnected: setUpdateConnected,
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
