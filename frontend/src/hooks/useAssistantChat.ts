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
  useAgentUI,
} from "@/context/AgentContext";
import { mergeHistoryWithDeltas } from "@/lib/history";
import type { AssistantChatItem, NodeDetail } from "@/types";

const ASSISTANT_ID = "assistant";

export function useAssistantChat() {
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

  useEffect(() => {
    if (!connected) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      clearAgentHistory(ASSISTANT_ID);
      try {
        const data = await fetchNodeDetail(ASSISTANT_ID, controller.signal);
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
  }, [clearAgentHistory, connected]);

  const timelineItems = useMemo<AssistantChatItem[]>(() => {
    const history = mergeHistoryWithDeltas({
      history: detail?.history ?? [],
      incremental: agentHistories.get(ASSISTANT_ID),
      deltas: streamingDeltas.get(ASSISTANT_ID),
      fetchedAt: fetchedAt || Date.now(),
    });

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
