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
import { useFormations } from "@/hooks/useFormations";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  AgentFeedContext,
  MAX_ACTIVITY_FEED_ITEMS,
  normalizeEventTimestampMs,
  type ActivityFeedEntry,
} from "@/context/AgentFeedContext";
import type {
  AgentEvent,
  AssistantChatMessage,
  Formation,
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
  | "formation"
  | "providers"
  | "roles"
  | "prompts"
  | "tools"
  | "channels"
  | "settings";

interface AgentRuntimeContextValue {
  agents: Map<string, Node>;
  formations: Map<string, Formation>;
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

interface AgentFormationsContextValue {
  formations: Map<string, Formation>;
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
const AgentFormationsContext =
  createContext<AgentFormationsContextValue | null>(null);
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
const MAX_TRACKED_TOOL_CALL_IDS = 256;

function shouldTrackFeedEntry(entry: HistoryEntry): boolean {
  return (
    entry.type === "ReceivedMessage" ||
    entry.type === "AssistantText" ||
    entry.type === "SentMessage" ||
    entry.type === "AssistantThinking" ||
    entry.type === "ToolCall" ||
    entry.type === "ErrorEntry"
  );
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { agents, handleUpdateEvent } = useAgents();
  const { formations, handleUpdateEvent: handleFormationEvent } =
    useFormations();
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
  const [recentActivities, setRecentActivities] = useState<ActivityFeedEntry[]>(
    [],
  );
  const [pendingAssistantMessages, setPendingAssistantMessages] = useState<
    PendingAssistantChatMessage[]
  >([]);
  const [currentPage, setCurrentPage] = useState<PageId>("formation");
  const msgTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const toolTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const assistantMessageCounterRef = useRef(0);
  const activityEntryCounterRef = useRef(0);
  const seenToolCallIdsRef = useRef<Set<string>>(new Set());

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
      handleFormationEvent(event);

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
        if (shouldTrackFeedEntry(entry)) {
          let shouldAppendActivity = true;
          let toolCallIdToReplace: string | null = null;

          if (entry.type === "ToolCall" && entry.tool_call_id) {
            if (seenToolCallIdsRef.current.has(entry.tool_call_id)) {
              shouldAppendActivity = false;
              toolCallIdToReplace = entry.tool_call_id;
            } else {
              seenToolCallIdsRef.current.add(entry.tool_call_id);
              if (seenToolCallIdsRef.current.size > MAX_TRACKED_TOOL_CALL_IDS) {
                const oldestId = seenToolCallIdsRef.current
                  .values()
                  .next().value;
                if (oldestId) {
                  seenToolCallIdsRef.current.delete(oldestId);
                }
              }
            }
          }

          if (shouldAppendActivity) {
            const timestampMs = normalizeEventTimestampMs(event.timestamp);
            const activityEntry: ActivityFeedEntry = {
              id: `activity-${timestampMs}-${activityEntryCounterRef.current++}`,
              agentId: event.agent_id,
              entry,
              timestampMs,
            };
            setRecentActivities((prev) => {
              const next = [...prev, activityEntry];
              return next.slice(-MAX_ACTIVITY_FEED_ITEMS);
            });
          } else if (toolCallIdToReplace) {
            const timestampMs = normalizeEventTimestampMs(event.timestamp);
            setRecentActivities((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                const activityEntry = next[i];
                if (
                  activityEntry.entry.type === "ToolCall" &&
                  activityEntry.entry.tool_call_id === toolCallIdToReplace
                ) {
                  next[i] = {
                    ...activityEntry,
                    entry,
                    timestampMs,
                  };
                  break;
                }
              }
              return next;
            });
          }
        }

        if (
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
        } else if (
          (entry.type === "SentMessage" || entry.type === "ReceivedMessage") &&
          entry.message_id
        ) {
          setStreamingDeltas((prev) => {
            const list = prev.get(event.agent_id);
            if (!list || list.length === 0) return prev;
            const next = new Map(prev);
            const filtered = list.filter((delta) => {
              if (delta.type === "SentMessageDelta") {
                return delta.message_id !== entry.message_id;
              }
              if (delta.type === "ReceivedMessageDelta") {
                return delta.message_id !== entry.message_id;
              }
              return true;
            });
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
    [handleFormationEvent, handleUpdateEvent],
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

  const formationsValue = useMemo(
    () => ({
      formations,
    }),
    [formations],
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

  const feedValue = useMemo(
    () => ({
      recentActivities,
    }),
    [recentActivities],
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
      <AgentFormationsContext.Provider value={formationsValue}>
        <AgentConnectionContext.Provider value={connectionValue}>
          <AgentHistoryContext.Provider value={historyValue}>
            <AgentActivityContext.Provider value={activityValue}>
              <AgentFeedContext.Provider value={feedValue}>
                <AgentUIContext.Provider value={uiValue}>
                  {children}
                </AgentUIContext.Provider>
              </AgentFeedContext.Provider>
            </AgentActivityContext.Provider>
          </AgentHistoryContext.Provider>
        </AgentConnectionContext.Provider>
      </AgentFormationsContext.Provider>
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

export function useAgentFormationRuntime() {
  const ctx = useContext(AgentFormationsContext);
  if (!ctx) {
    throw new Error(
      "useAgentFormationRuntime must be used within AgentProvider",
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
  const { formations } = useAgentFormationRuntime();
  const { connected } = useAgentConnectionRuntime();
  const { agentHistories, clearAgentHistory, streamingDeltas } =
    useAgentHistoryRuntime();
  const { activeMessages, activeToolCalls } = useAgentActivityRuntime();

  return useMemo(
    () => ({
      agents,
      formations,
      connected,
      agentHistories,
      clearAgentHistory,
      streamingDeltas,
      activeMessages,
      activeToolCalls,
    }),
    [
      agents,
      formations,
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
