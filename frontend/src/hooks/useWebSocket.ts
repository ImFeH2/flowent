import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AgentEvent } from "@/types";

const MAX_DELAY = 10000;

interface UseWebSocketOptions {
  onDisplayEvent: (event: AgentEvent) => void;
  onUpdateEvent: (event: AgentEvent) => void;
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

    function createConnection(
      path: string,
      onMessage: React.MutableRefObject<(event: AgentEvent) => void>,
      setConnected: (v: boolean) => void,
    ) {
      const retryDelay = { current: 1000 };
      const wasConnected = { current: false };
      let ws: WebSocket;

      const connect = () => {
        if (disposed) return;
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${window.location.host}${path}`);

        ws.onopen = () => {
          setConnected(true);
          retryDelay.current = 1000;
          if (wasConnected.current) {
            toast.success(`Reconnected ${path}`);
          }
          wasConnected.current = true;
        };

        ws.onmessage = (e) => {
          try {
            const event: AgentEvent = JSON.parse(e.data);
            onMessage.current(event);
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (disposed) return;
          if (wasConnected.current) {
            toast.error(`Connection lost ${path}, reconnecting...`);
          }
          const delay = retryDelay.current;
          retryDelay.current = Math.min(delay * 2, MAX_DELAY);
          setTimeout(connect, delay);
        };

        ws.onerror = () => {
          ws.close();
        };
      };

      connect();
      return () => {
        ws?.close();
      };
    }

    const cleanupDisplay = createConnection(
      "/ws/events",
      onDisplayRef,
      setDisplayConnected,
    );
    const cleanupUpdate = createConnection(
      "/ws/updates",
      onUpdateRef,
      setUpdateConnected,
    );

    return () => {
      disposed = true;
      cleanupDisplay();
      cleanupUpdate();
    };
  }, []);

  return { connected: displayConnected && updateConnected };
}
