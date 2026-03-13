import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sendStewardMessageRequest } from "@/lib/api";
import { useAgents } from "@/hooks/useAgents";
import { useWebSocket } from "@/hooks/useWebSocket";
import type {
  AgentEvent,
  HistoryEntry,
  Node,
  PendingStewardMessage,
  StewardMessage,
  StreamingDelta,
} from "@/types";

export interface ActiveMessage {
  id: string;
  fromId: string;
  toId: string;
  timestamp: number;
}

export type PageId =
  | "graph"
  | "providers"
  | "roles"
  | "prompts"
  | "tools"
  | "settings";

interface AgentRuntimeContextValue {
  agents: Map<string, Node>;
  events: AgentEvent[];
  connected: boolean;
  agentHistories: Map<string, HistoryEntry[]>;
  clearAgentHistory: (agentId: string) => void;
  streamingDeltas: Map<string, StreamingDelta[]>;
  activeMessages: ActiveMessage[];
  activeToolCalls: Map<string, string>;
}

interface AgentUIContextValue {
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  hoveredAgentId: string | null;
  setHoveredAgentId: (id: string | null) => void;
  pendingStewardMessages: PendingStewardMessage[];
  sendStewardMessage: (content: string) => Promise<void>;
  currentPage: PageId;
  setCurrentPage: (page: PageId) => void;
}

const AgentRuntimeContext = createContext<AgentRuntimeContextValue | null>(
  null,
);
const AgentUIContext = createContext<AgentUIContextValue | null>(null);

const MESSAGE_ANIMATION_MS = 2000;
const TOOL_CALL_ANIMATION_MS = 2000;
const STEWARD_ID = "steward";

export function AgentProvider({ children }: { children: ReactNode }) {
  const { agents, events, handleDisplayEvent, handleUpdateEvent } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
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
  const [pendingStewardMessages, setPendingStewardMessages] = useState<
    PendingStewardMessage[]
  >([]);
  const [currentPage, setCurrentPage] = useState<PageId>("graph");
  const msgTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const toolTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const stewardMessageCounterRef = useRef(0);

  const nextStewardMessageId = useCallback(
    (from: StewardMessage["from"], timestamp: number) =>
      `${from}-${timestamp}-${stewardMessageCounterRef.current++}`,
    [],
  );

  const createStewardMessage = useCallback(
    (
      from: StewardMessage["from"],
      content: string,
      timestamp: number,
    ): StewardMessage => ({
      id: nextStewardMessageId(from, timestamp),
      from,
      content,
      timestamp,
    }),
    [nextStewardMessageId],
  );

  const sendStewardMessage = useCallback(
    async (content: string) => {
      const timestamp = Date.now();
      setPendingStewardMessages((prev) => [
        ...prev,
        {
          ...createStewardMessage("human", content, timestamp),
          type: "PendingHumanMessage",
        },
      ]);

      try {
        await sendStewardMessageRequest(content);
      } catch (error) {
        setPendingStewardMessages((prev) => {
          const idx = prev.findIndex(
            (message) =>
              message.content === content && message.timestamp === timestamp,
          );
          if (idx < 0) {
            return prev;
          }
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        });
        throw error;
      }
    },
    [createStewardMessage],
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
          const message: ActiveMessage = {
            id: msgId,
            fromId,
            toId,
            timestamp: Date.now(),
          };
          setActiveMessages((prev) => [...prev, message]);
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
        setActiveToolCalls((current) => {
          const next = new Map(current);
          next.set(agentId, toolName);
          return next;
        });
        const timer = setTimeout(() => {
          setActiveToolCalls((current) => {
            const next = new Map(current);
            next.delete(agentId);
            return next;
          });
          toolTimers.current.delete(agentId);
        }, TOOL_CALL_ANIMATION_MS);
        toolTimers.current.set(agentId, timer);
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
          event.agent_id === STEWARD_ID &&
          entry.type === "ReceivedMessage" &&
          entry.from_id === "human" &&
          entry.content
        ) {
          setPendingStewardMessages((prev) => {
            const idx = prev.findIndex(
              (message) => message.content === entry.content,
            );
            if (idx < 0) {
              return prev;
            }
            const next = [...prev];
            next.splice(idx, 1);
            return next;
          });
        }

        if (
          entry.type === "AssistantText" ||
          entry.type === "AssistantThinking"
        ) {
          setStreamingDeltas((prev) => {
            const list = prev.get(event.agent_id);
            if (!list || list.length === 0) return prev;
            const next = new Map(prev);
            const filtered = list.filter(
              (delta) =>
                delta.type !== "ContentDelta" && delta.type !== "ThinkingDelta",
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
              (delta) =>
                !(
                  delta.type === "ToolResultDelta" &&
                  delta.tool_call_id === entry.tool_call_id
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
              (historyEntry) =>
                historyEntry.type === "ToolCall" &&
                historyEntry.tool_call_id === entry.tool_call_id &&
                historyEntry.streaming === true,
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

  const runtimeValue = useMemo(
    () => ({
      agents,
      events,
      connected,
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
      activeMessages,
      activeToolCalls,
    }),
    [
      agents,
      events,
      connected,
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
      activeMessages,
      activeToolCalls,
    ],
  );

  const uiValue = useMemo(
    () => ({
      selectedAgentId,
      selectAgent,
      hoveredAgentId,
      setHoveredAgentId,
      pendingStewardMessages,
      sendStewardMessage,
      currentPage,
      setCurrentPage,
    }),
    [
      selectedAgentId,
      selectAgent,
      hoveredAgentId,
      pendingStewardMessages,
      sendStewardMessage,
      currentPage,
    ],
  );

  return (
    <AgentRuntimeContext.Provider value={runtimeValue}>
      <AgentUIContext.Provider value={uiValue}>
        {children}
      </AgentUIContext.Provider>
    </AgentRuntimeContext.Provider>
  );
}

export function useAgentRuntime() {
  const ctx = useContext(AgentRuntimeContext);
  if (!ctx) {
    throw new Error("useAgentRuntime must be used within AgentProvider");
  }
  return ctx;
}

export function useAgentUI() {
  const ctx = useContext(AgentUIContext);
  if (!ctx) {
    throw new Error("useAgentUI must be used within AgentProvider");
  }
  return ctx;
}

export function useAgent() {
  const runtime = useAgentRuntime();
  const ui = useAgentUI();
  return useMemo(() => ({ ...runtime, ...ui }), [runtime, ui]);
}
