import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sendAssistantMessageRequest } from "@/lib/api";
import { useAgents } from "@/hooks/useAgents";
import { useWebSocket } from "@/hooks/useWebSocket";
import type {
  AgentEvent,
  AssistantChatMessage,
  HistoryEntry,
  Node,
  PendingAssistantChatMessage,
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
  connected: boolean;
  agentHistories: Map<string, HistoryEntry[]>;
  clearAgentHistory: (agentId: string) => void;
  streamingDeltas: Map<string, StreamingDelta[]>;
  activeMessages: ActiveMessage[];
  activeToolCalls: Map<string, string>;
}

interface AgentNodesContextValue {
  agents: Map<string, Node>;
}

interface AgentConnectionContextValue {
  connected: boolean;
}

interface AgentHistoryContextValue {
  agentHistories: Map<string, HistoryEntry[]>;
  clearAgentHistory: (agentId: string) => void;
  streamingDeltas: Map<string, StreamingDelta[]>;
}

interface AgentActivityContextValue {
  activeMessages: ActiveMessage[];
  activeToolCalls: Map<string, string>;
}

interface AgentUIContextValue {
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  hoveredAgentId: string | null;
  setHoveredAgentId: (id: string | null) => void;
  pendingAssistantMessages: PendingAssistantChatMessage[];
  sendAssistantMessage: (content: string) => Promise<void>;
  currentPage: PageId;
  setCurrentPage: (page: PageId) => void;
}

const AgentNodesContext = createContext<AgentNodesContextValue | null>(null);
const AgentConnectionContext =
  createContext<AgentConnectionContextValue | null>(null);
const AgentHistoryContext = createContext<AgentHistoryContextValue | null>(
  null,
);
const AgentActivityContext = createContext<AgentActivityContextValue | null>(
  null,
);
const AgentUIContext = createContext<AgentUIContextValue | null>(null);

const MESSAGE_ANIMATION_MS = 2000;
const TOOL_CALL_ANIMATION_MS = 2000;
const ASSISTANT_ID = "assistant";

export function AgentProvider({ children }: { children: ReactNode }) {
  const { agents, handleUpdateEvent } = useAgents();
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
  const [pendingAssistantMessages, setPendingAssistantMessages] = useState<
    PendingAssistantChatMessage[]
  >([]);
  const [currentPage, setCurrentPage] = useState<PageId>("graph");
  const msgTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const toolTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const assistantMessageCounterRef = useRef(0);

  const nextAssistantMessageId = useCallback(
    (from: AssistantChatMessage["from"], timestamp: number) =>
      `${from}-${timestamp}-${assistantMessageCounterRef.current++}`,
    [],
  );

  const createAssistantMessage = useCallback(
    (
      from: AssistantChatMessage["from"],
      content: string,
      timestamp: number,
    ): AssistantChatMessage => ({
      id: nextAssistantMessageId(from, timestamp),
      from,
      content,
      timestamp,
    }),
    [nextAssistantMessageId],
  );

  const sendAssistantMessage = useCallback(
    async (content: string) => {
      const timestamp = Date.now();
      setPendingAssistantMessages((prev) => [
        ...prev,
        {
          ...createAssistantMessage("human", content, timestamp),
          type: "PendingHumanMessage",
        },
      ]);

      try {
        await sendAssistantMessageRequest(content);
      } catch (error) {
        setPendingAssistantMessages((prev) => {
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
    [createAssistantMessage],
  );

  const clearAgentHistory = useCallback((agentId: string) => {
    setAgentHistories((prev) => {
      if (!prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  const onDisplayEvent = useCallback(() => {}, []);

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
          event.agent_id === ASSISTANT_ID &&
          entry.type === "ReceivedMessage" &&
          entry.from_id === "human" &&
          entry.content
        ) {
          setPendingAssistantMessages((prev) => {
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

  const nodesValue = useMemo(
    () => ({
      agents,
    }),
    [agents],
  );

  const connectionValue = useMemo(
    () => ({
      connected,
    }),
    [connected],
  );

  const historyValue = useMemo(
    () => ({
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
    }),
    [agentHistories, clearAgentHistory, streamingDeltas],
  );

  const activityValue = useMemo(
    () => ({
      activeMessages,
      activeToolCalls,
    }),
    [activeMessages, activeToolCalls],
  );

  const uiValue = useMemo(
    () => ({
      selectedAgentId,
      selectAgent,
      hoveredAgentId,
      setHoveredAgentId,
      pendingAssistantMessages,
      sendAssistantMessage,
      currentPage,
      setCurrentPage,
    }),
    [
      selectedAgentId,
      selectAgent,
      hoveredAgentId,
      pendingAssistantMessages,
      sendAssistantMessage,
      currentPage,
    ],
  );

  return (
    <AgentNodesContext.Provider value={nodesValue}>
      <AgentConnectionContext.Provider value={connectionValue}>
        <AgentHistoryContext.Provider value={historyValue}>
          <AgentActivityContext.Provider value={activityValue}>
            <AgentUIContext.Provider value={uiValue}>
              {children}
            </AgentUIContext.Provider>
          </AgentActivityContext.Provider>
        </AgentHistoryContext.Provider>
      </AgentConnectionContext.Provider>
    </AgentNodesContext.Provider>
  );
}

export function useAgentNodesRuntime() {
  const ctx = useContext(AgentNodesContext);
  if (!ctx) {
    throw new Error("useAgentNodesRuntime must be used within AgentProvider");
  }
  return ctx;
}

export function useAgentConnectionRuntime() {
  const ctx = useContext(AgentConnectionContext);
  if (!ctx) {
    throw new Error(
      "useAgentConnectionRuntime must be used within AgentProvider",
    );
  }
  return ctx;
}

export function useAgentHistoryRuntime() {
  const ctx = useContext(AgentHistoryContext);
  if (!ctx) {
    throw new Error("useAgentHistoryRuntime must be used within AgentProvider");
  }
  return ctx;
}

export function useAgentActivityRuntime() {
  const ctx = useContext(AgentActivityContext);
  if (!ctx) {
    throw new Error(
      "useAgentActivityRuntime must be used within AgentProvider",
    );
  }
  return ctx;
}

export function useAgentRuntime(): AgentRuntimeContextValue {
  const { agents } = useAgentNodesRuntime();
  const { connected } = useAgentConnectionRuntime();
  const { agentHistories, clearAgentHistory, streamingDeltas } =
    useAgentHistoryRuntime();
  const { activeMessages, activeToolCalls } = useAgentActivityRuntime();

  return useMemo(
    () => ({
      agents,
      connected,
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
      activeMessages,
      activeToolCalls,
    }),
    [
      agents,
      connected,
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
      activeMessages,
      activeToolCalls,
    ],
  );
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
