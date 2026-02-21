import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAgents } from "@/hooks/useAgents";
import type {
  Node,
  AgentEvent,
  HistoryEntry,
  StreamingDelta,
  StewardMessage,
} from "@/types";

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
  agents: Map<string, Node>;
  events: AgentEvent[];
  connected: boolean;
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
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
  streamingDeltas: Map<string, StreamingDelta[]>;
  activeMessages: ActiveMessage[];
  activeToolCalls: Map<string, string>;
  eventPanelVisible: boolean;
  toggleEventPanel: () => void;
  stewardMessages: StewardMessage[];
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export const DEFAULT_WIDTH = 700;
export const DEFAULT_HEIGHT = 480;

const MESSAGE_ANIMATION_MS = 2000;
const TOOL_CALL_ANIMATION_MS = 2000;

export function AgentProvider({ children }: { children: ReactNode }) {
  const { agents, events, handleDisplayEvent, handleUpdateEvent } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [openWindows, setOpenWindows] = useState<Map<string, WindowState>>(
    () => new Map(),
  );
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [agentHistories, setAgentHistories] = useState<
    Map<string, HistoryEntry[]>
  >(() => new Map());
  const [streamingDeltas, setStreamingDeltas] = useState<
    Map<string, StreamingDelta[]>
  >(() => new Map());
  const [activeMessages, setActiveMessages] = useState<ActiveMessage[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [eventPanelVisible, setEventPanelVisible] = useState(false);
  const [stewardMessages, setStewardMessages] = useState<StewardMessage[]>([]);
  const [currentPage, setCurrentPage] = useState("graph");
  const msgTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const toolTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearAgentHistory = useCallback((agentId: string) => {
    setAgentHistories((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  const onDisplayEvent = useCallback(
    (event: AgentEvent) => {
      handleDisplayEvent(event);
    },
    [handleDisplayEvent],
  );

  const onUpdateEvent = useCallback(
    (event: AgentEvent) => {
      handleUpdateEvent(event);

      if (event.type === "node_message") {
        const fromId = event.agent_id;
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

      if (event.type === "steward_content") {
        const content = event.data.content as string;
        setStewardMessages((prev) => [
          ...prev,
          { content, timestamp: Date.now(), from: "steward" },
        ]);
      }

      if (event.type === "history_entry_delta") {
        const delta = event.data as unknown as StreamingDelta;
        setStreamingDeltas((prev) => {
          const next = new Map(prev);
          const list = next.get(event.agent_id) ?? [];
          next.set(event.agent_id, [...list, delta]);
          return next;
        });
      }

      if (event.type === "history_entry_added") {
        const entry = event.data as unknown as HistoryEntry;

        if (
          entry.type === "AssistantText" ||
          entry.type === "AssistantThinking"
        ) {
          setStreamingDeltas((prev) => {
            const list = prev.get(event.agent_id);
            if (!list || list.length === 0) return prev;
            const next = new Map(prev);
            const filtered = list.filter(
              (d) => d.type !== "ContentDelta" && d.type !== "ThinkingDelta",
            );
            if (filtered.length === 0) {
              next.delete(event.agent_id);
            } else {
              next.set(event.agent_id, filtered);
            }
            return next;
          });
        } else if (
          entry.type === "ToolCall" &&
          entry.tool_call_id &&
          !entry.streaming
        ) {
          setStreamingDeltas((prev) => {
            const list = prev.get(event.agent_id);
            if (!list || list.length === 0) return prev;
            const next = new Map(prev);
            const filtered = list.filter(
              (d) =>
                !(
                  d.type === "ToolResultDelta" &&
                  d.tool_call_id === entry.tool_call_id
                ),
            );
            if (filtered.length === 0) {
              next.delete(event.agent_id);
            } else {
              next.set(event.agent_id, filtered);
            }
            return next;
          });
        }

        setAgentHistories((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.agent_id) ?? [];

          if (
            entry.type === "ToolCall" &&
            entry.tool_call_id &&
            !entry.streaming
          ) {
            const idx = existing.findIndex(
              (e) =>
                e.type === "ToolCall" &&
                e.tool_call_id === entry.tool_call_id &&
                e.streaming === true,
            );
            if (idx >= 0) {
              const updated = [...existing];
              updated[idx] = entry;
              next.set(event.agent_id, updated);
              return next;
            }
          }

          next.set(event.agent_id, [...existing, entry]);
          return next;
        });
      }
    },
    [handleUpdateEvent],
  );

  const { connected } = useWebSocket({ onDisplayEvent, onUpdateEvent });

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgentId(id);
  }, []);

  const openAgentWindow = useCallback(
    (agentId: string, x: number, y: number) => {
      setOpenWindows((prev) => {
        if (prev.has(agentId)) return prev;
        const next = new Map(prev);
        next.set(agentId, {
          x,
          y,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        });
        return next;
      });
    },
    [],
  );

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
      connected,
      selectedAgentId,
      selectAgent,
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
      streamingDeltas,
      activeMessages,
      activeToolCalls,
      eventPanelVisible,
      toggleEventPanel,
      stewardMessages,
      currentPage,
      setCurrentPage,
    }),
    [
      agents,
      events,
      connected,
      selectedAgentId,
      selectAgent,
      openWindows,
      openAgentWindow,
      closeAgentWindow,
      closeAllWindows,
      updateWindowPosition,
      updateWindowSize,
      hoveredAgentId,
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
      activeMessages,
      activeToolCalls,
      eventPanelVisible,
      toggleEventPanel,
      stewardMessages,
      currentPage,
      setCurrentPage,
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
