import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { toast } from "sonner";
import { fetchNodeDetail } from "@/lib/api";
import {
  useAgentConnectionRuntime,
  useAgentHistoryRuntime,
  useAgentNodesRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { getAssistantNodeId } from "@/lib/assistant";
import { mergeHistoryWithDeltas } from "@/lib/history";
import type { AssistantChatItem, NodeDetail } from "@/types";

export function useAssistantChat() {
  const { agents } = useAgentNodesRuntime();
  const { connected } = useAgentConnectionRuntime();
  const { agentHistories, clearAgentHistory, streamingDeltas } =
    useAgentHistoryRuntime();
  const { pendingAssistantMessages, sendAssistantMessage } = useAgentUI();
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const assistantId = useMemo(() => getAssistantNodeId(agents), [agents]);

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
  }, [assistantId, clearAgentHistory, connected]);

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

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !autoScrollRef.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [timelineItems]);

  const onMessagesScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const distanceToBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    autoScrollRef.current = distanceToBottom <= 24;
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
    sending,
    sendMessage,
    setInput,
    timelineItems,
  };
}
