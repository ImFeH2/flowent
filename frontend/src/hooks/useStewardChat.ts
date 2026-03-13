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
import { useAgentRuntime, useAgentUI } from "@/context/AgentContext";
import { mergeHistoryWithDeltas } from "@/lib/history";
import type { NodeDetail, StewardChatItem } from "@/types";

const STEWARD_ID = "steward";

export function useStewardChat() {
  const { connected, agentHistories, clearAgentHistory, streamingDeltas } =
    useAgentRuntime();
  const { pendingStewardMessages, sendStewardMessage } = useAgentUI();
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
      clearAgentHistory(STEWARD_ID);
      try {
        const data = await fetchNodeDetail(STEWARD_ID, controller.signal);
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

  const timelineItems = useMemo<StewardChatItem[]>(() => {
    const history = mergeHistoryWithDeltas({
      history: detail?.history ?? [],
      incremental: agentHistories.get(STEWARD_ID),
      deltas: streamingDeltas.get(STEWARD_ID),
      fetchedAt: fetchedAt || Date.now(),
    });

    return [
      ...history,
      ...pendingStewardMessages.map((message) => ({ ...message })),
    ];
  }, [
    agentHistories,
    detail,
    fetchedAt,
    pendingStewardMessages,
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
      await sendStewardMessage(content);
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
