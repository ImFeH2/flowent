import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAgents } from "@/hooks/useAgents";
import type { Agent, AgentEvent, ChatMessage, HistoryEntry, PathAccessRequest } from "@/types";

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveMessage {
  id: string;
  fromId: string;
  toId: string;
  timestamp: number;
}

interface AgentContextValue {
  agents: Map<string, Agent>;
  events: AgentEvent[];
  messages: ChatMessage[];
  connected: boolean;
  stewardId: string | null;
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  sendMessage: (content: string) => void;
  pendingPathAccess: PathAccessRequest[];
  resolvePathAccess: (requestId: string, approved: boolean) => void;
  openWindows: Map<string, WindowState>;
  openAgentWindow: (agentId: string, x: number, y: number) => void;
  closeAgentWindow: (agentId: string) => void;
  closeAllWindows: () => void;
  updateWindowPosition: (agentId: string, x: number, y: number) => void;
  updateWindowSize: (agentId: string, width: number, height: number) => void;
  hoveredAgentId: string | null;
  setHoveredAgentId: (id: string | null) => void;
  agentHistories: Map<string, HistoryEntry[]>;
  clearAgentHistory: (agentId: string) => void;
  streamingBuffers: Map<string, StreamingBuffer>;
  activeMessages: ActiveMessage[];
  activeToolCalls: Map<string, string>;
  eventPanelVisible: boolean;
  toggleEventPanel: () => void;
}

export interface StreamingBuffer {
  content: string;
  thinking: string;
  toolResult: string;
}

const AgentContext = createContext<AgentContextValue | null>(null);

const DEFAULT_WIDTH = 700;
const DEFAULT_HEIGHT = 480;

const MESSAGE_ANIMATION_MS = 2000;
const TOOL_CALL_ANIMATION_MS = 2000;

export function AgentProvider({ children }: { children: ReactNode }) {
  const { agents, events, handleDisplayEvent, handleUpdateEvent } = useAgents();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [openWindows, setOpenWindows] = useState<Map<string, WindowState>>(
    () => new Map(),
  );
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [agentHistories, setAgentHistories] = useState<Map<string, HistoryEntry[]>>(
    () => new Map(),
  );
  const [streamingBuffers, setStreamingBuffers] = useState<Map<string, StreamingBuffer>>(
    () => new Map(),
  );
  const [activeMessages, setActiveMessages] = useState<ActiveMessage[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [pendingPathAccess, setPendingPathAccess] = useState<PathAccessRequest[]>([]);
  const [eventPanelVisible, setEventPanelVisible] = useState(true);
  const msgTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const toolTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearAgentHistory = useCallback((agentId: string) => {
    setAgentHistories((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  const stewardId = useMemo(() => {
    for (const [id, agent] of agents) {
      if (agent.role === "steward") return id;
    }
    return null;
  }, [agents]);

  const resolvePathAccess = useCallback(
    (requestId: string, approved: boolean) => {
      fetch(`/api/path-access/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      }).catch(() => {
        toast.error("Failed to resolve path access request");
      });
      setPendingPathAccess((prev) => prev.filter((r) => r.requestId !== requestId));
    },
    [],
  );

  const onDisplayEvent = useCallback(
    (event: AgentEvent) => {
      handleDisplayEvent(event);
    },
    [handleDisplayEvent],
  );

  const onUpdateEvent = useCallback(
    (event: AgentEvent) => {
      handleUpdateEvent(event);

      if (event.type === "agent_message") {
        if (event.data.to_id === "human") {
          setMessages((prev) => [
            ...prev,
            {
              id: `s-${Date.now()}-${Math.random()}`,
              from: "steward",
              content: event.data.content as string,
              timestamp: event.timestamp,
            },
          ]);
        }

        const fromId = event.data.from_id as string | undefined;
        const toId = event.data.to_id as string | undefined;
        if (fromId && toId) {
          const msgId = `msg-${Date.now()}-${Math.random()}`;
          const am: ActiveMessage = {
            id: msgId,
            fromId,
            toId,
            timestamp: Date.now(),
          };
          setActiveMessages((prev) => [...prev, am]);
          const timer = setTimeout(() => {
            setActiveMessages((prev) => prev.filter((m) => m.id !== msgId));
            msgTimers.current.delete(msgId);
          }, MESSAGE_ANIMATION_MS);
          msgTimers.current.set(msgId, timer);
        }
      }

      if (event.type === "tool_called") {
        const toolName = event.data.tool as string;
        const agentId = event.agent_id;
        const prev = toolTimers.current.get(agentId);
        if (prev) clearTimeout(prev);
        setActiveToolCalls((p) => {
          const next = new Map(p);
          next.set(agentId, toolName);
          return next;
        });
        const timer = setTimeout(() => {
          setActiveToolCalls((p) => {
            const next = new Map(p);
            next.delete(agentId);
            return next;
          });
          toolTimers.current.delete(agentId);
        }, TOOL_CALL_ANIMATION_MS);
        toolTimers.current.set(agentId, timer);
      }

      if (event.type === "path_access_requested") {
        const data = event.data;
        setPendingPathAccess((prev) => [
          ...prev,
          {
            requestId: data.request_id as string,
            agentId: event.agent_id,
            path: data.path as string,
            reason: data.reason as string,
          },
        ]);
      }

      if (event.type === "history_entry_delta") {
        const deltaType = event.data.delta_type as string;
        const delta = event.data.delta as string;
        setStreamingBuffers((prev) => {
          const next = new Map(prev);
          const buf = next.get(event.agent_id) ?? { content: "", thinking: "", toolResult: "" };
          if (deltaType === "content") {
            next.set(event.agent_id, { ...buf, content: buf.content + delta });
          } else if (deltaType === "thinking") {
            next.set(event.agent_id, { ...buf, thinking: buf.thinking + delta });
          } else if (deltaType === "tool_result") {
            next.set(event.agent_id, { ...buf, toolResult: buf.toolResult + delta });
          }
          return next;
        });
      }

      if (event.type === "history_entry_added") {
        const entry = event.data as unknown as HistoryEntry;

        if (entry.type === "assistant_text" || entry.type === "assistant_thinking") {
          setStreamingBuffers((prev) => {
            const buf = prev.get(event.agent_id);
            if (!buf) return prev;
            const next = new Map(prev);
            next.set(event.agent_id, { ...buf, content: "", thinking: "" });
            return next;
          });
        } else if (entry.type === "tool_result") {
          setStreamingBuffers((prev) => {
            const buf = prev.get(event.agent_id);
            if (!buf) return prev;
            const next = new Map(prev);
            next.set(event.agent_id, { ...buf, toolResult: "" });
            return next;
          });
        }

        setAgentHistories((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.agent_id) ?? [];
          next.set(event.agent_id, [...existing, entry]);
          return next;
        });
      }
    },
    [handleUpdateEvent],
  );

  const { connected } = useWebSocket({ onDisplayEvent, onUpdateEvent });

  const sendMessage = useCallback(
    (content: string) => {
      const msg: ChatMessage = {
        id: `h-${Date.now()}-${Math.random()}`,
        from: "human",
        content,
        timestamp: Date.now() / 1000,
      };
      setMessages((prev) => [...prev, msg]);

      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      }).catch(() => {
        toast.error("Failed to send message");
      });
    },
    [],
  );

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  const openAgentWindow = useCallback((agentId: string, x: number, y: number) => {
    setOpenWindows((prev) => {
      if (prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.set(agentId, { x, y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
      return next;
    });
  }, []);

  const closeAgentWindow = useCallback((agentId: string) => {
    setOpenWindows((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  const closeAllWindows = useCallback(() => {
    setOpenWindows((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const updateWindowPosition = useCallback(
    (agentId: string, x: number, y: number) => {
      setOpenWindows((prev) => {
        const existing = prev.get(agentId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(agentId, { ...existing, x, y });
        return next;
      });
    },
    [],
  );

  const updateWindowSize = useCallback(
    (agentId: string, width: number, height: number) => {
      setOpenWindows((prev) => {
        const existing = prev.get(agentId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(agentId, { ...existing, width, height });
        return next;
      });
    },
    [],
  );

  const toggleEventPanel = useCallback(() => {
    setEventPanelVisible((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({
      agents,
      events,
      messages,
      connected,
      stewardId,
      selectedAgentId,
      selectAgent,
      sendMessage,
      openWindows,
      openAgentWindow,
      closeAgentWindow,
      closeAllWindows,
      updateWindowPosition,
      updateWindowSize,
      hoveredAgentId,
      setHoveredAgentId,
      agentHistories,
      clearAgentHistory,
      streamingBuffers,
      activeMessages,
      activeToolCalls,
      pendingPathAccess,
      resolvePathAccess,
      eventPanelVisible,
      toggleEventPanel,
    }),
    [
      agents,
      events,
      messages,
      connected,
      stewardId,
      selectedAgentId,
      selectAgent,
      sendMessage,
      openWindows,
      openAgentWindow,
      closeAgentWindow,
      closeAllWindows,
      updateWindowPosition,
      updateWindowSize,
      hoveredAgentId,
      agentHistories,
      clearAgentHistory,
      streamingBuffers,
      activeMessages,
      activeToolCalls,
      pendingPathAccess,
      resolvePathAccess,
      eventPanelVisible,
      toggleEventPanel,
    ],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
