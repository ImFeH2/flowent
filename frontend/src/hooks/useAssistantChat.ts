import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { toast } from "sonner";
import { clearAssistantChatRequest, fetchNodeDetail } from "@/lib/api";
import {
  useAgentActivityRuntime,
  useAgentConnectionRuntime,
  useAgentHistoryRuntime,
  useAgentNodesRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { getAssistantNodeId } from "@/lib/assistant";
import {
  clearConversationHistory,
  mergeHistoryWithDeltas,
} from "@/lib/history";
import type { AssistantChatItem, HistoryEntry, NodeDetail } from "@/types";

const SCROLL_BOTTOM_EPSILON = 1;

function isScrolledToBottom(element: HTMLDivElement) {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return maxScrollTop - element.scrollTop <= SCROLL_BOTTOM_EPSILON;
}

interface UseAssistantChatOptions {
  bottomInset?: number;
}

export function useAssistantChat(options: UseAssistantChatOptions = {}) {
  const { bottomInset = 0 } = options;
  const { agents } = useAgentNodesRuntime();
  const { connected } = useAgentConnectionRuntime();
  const {
    agentHistories,
    clearAgentHistory,
    historyClearedAt,
    streamingDeltas,
  } = useAgentHistoryRuntime();
  const { activeToolCalls } = useAgentActivityRuntime();
  const { pendingAssistantMessages, sendAssistantMessage } = useAgentUI();
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [input, setInput] = useState("");
  const [clearing, setClearing] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const assistantId = useMemo(() => getAssistantNodeId(agents), [agents]);
  const assistantNode = useMemo(
    () => (assistantId ? (agents.get(assistantId) ?? null) : null),
    [agents, assistantId],
  );
  const assistantHistoryClearedAt = assistantId
    ? (historyClearedAt.get(assistantId) ?? 0)
    : 0;

  useEffect(() => {
    if (!assistantHistoryClearedAt) {
      return;
    }

    setDetail((current) =>
      current
        ? {
            ...current,
            history: clearConversationHistory(current.history),
          }
        : current,
    );
    setFetchedAt(Date.now());
  }, [assistantHistoryClearedAt]);

  useEffect(() => {
    if (!connected || !assistantId) {
      setDetail(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      clearAgentHistory(assistantId);
      try {
        const data = await fetchNodeDetail(assistantId, controller.signal);
        if (cancelled || !data) {
          return;
        }
        setDetail(data);
        setFetchedAt(Date.now());
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          toast.error("Failed to load Assistant history");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [assistantHistoryClearedAt, assistantId, clearAgentHistory, connected]);

  const timelineItems = useMemo<AssistantChatItem[]>(() => {
    const history = assistantId
      ? mergeHistoryWithDeltas({
          history: detail?.history ?? [],
          incremental: agentHistories.get(assistantId),
          deltas: streamingDeltas.get(assistantId),
          fetchedAt: fetchedAt || Date.now(),
        })
      : [];

    return [
      ...history,
      ...pendingAssistantMessages.map((message) => ({ ...message })),
    ];
  }, [
    agentHistories,
    detail,
    fetchedAt,
    pendingAssistantMessages,
    streamingDeltas,
    assistantId,
  ]);

  const assistantActivity = useMemo(() => {
    const pendingCount = pendingAssistantMessages.length;
    const deltas = assistantId ? (streamingDeltas.get(assistantId) ?? []) : [];
    const running =
      connected &&
      (pendingCount > 0 ||
        assistantNode?.state === "running" ||
        activeToolCalls.has(assistantId ?? "") ||
        deltas.length > 0);
    const lastHumanIndex = [...timelineItems]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) =>
        item.type === "PendingHumanMessage"
          ? true
          : item.type === "ReceivedMessage" &&
            item.from_id === "human" &&
            Boolean(item.content),
      )?.index;
    const turnItems =
      lastHumanIndex === undefined
        ? []
        : timelineItems.slice(lastHumanIndex + 1);
    const hasAssistantText = turnItems.some(
      (item) => item.type === "AssistantText" && Boolean(item.content?.trim()),
    );
    const runningToolCall = [...turnItems]
      .reverse()
      .find(
        (item): item is HistoryEntry & { type: "ToolCall" } =>
          item.type === "ToolCall" && item.streaming === true,
      );
    const activeToolName = assistantId
      ? (activeToolCalls.get(assistantId) ?? null)
      : null;
    const toolName = activeToolName ?? runningToolCall?.tool_name ?? null;

    return {
      running,
      runningHint:
        running && lastHumanIndex !== undefined && !hasAssistantText
          ? {
              label: toolName ? "Running tools..." : "Thinking...",
              toolName,
            }
          : null,
    };
  }, [
    activeToolCalls,
    assistantId,
    assistantNode?.state,
    connected,
    pendingAssistantMessages.length,
    streamingDeltas,
    timelineItems,
  ]);

  const runningHintKey = assistantActivity.runningHint
    ? `${assistantActivity.runningHint.label}:${assistantActivity.runningHint.toolName ?? ""}`
    : "";

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !autoScrollRef.current) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      if (!autoScrollRef.current) {
        return;
      }
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [bottomInset, runningHintKey, timelineItems]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    let raf = 0;
    const observer = new ResizeObserver(() => {
      if (!autoScrollRef.current) {
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!autoScrollRef.current) {
          return;
        }
        element.scrollTop = element.scrollHeight;
      });
    });

    observer.observe(element);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const onMessagesScroll = (event: UIEvent<HTMLDivElement>) => {
    autoScrollRef.current = isScrolledToBottom(event.currentTarget);
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput("");

    try {
      await sendAssistantMessage(content);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!assistantId || clearing) {
      return;
    }

    setClearing(true);
    try {
      await clearAssistantChatRequest(assistantId);
      clearAgentHistory(assistantId);
      const data = await fetchNodeDetail(assistantId);
      setDetail(data);
      setFetchedAt(Date.now());
    } catch {
      toast.error("Failed to clear assistant chat");
    } finally {
      setClearing(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return {
    connected,
    handleKeyDown,
    input,
    onMessagesScroll,
    scrollRef,
    clearing,
    sending,
    clearChat,
    sendMessage,
    setInput,
    timelineItems,
    assistantActivity,
  };
}
