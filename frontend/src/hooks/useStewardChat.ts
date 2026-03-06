import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { useAgent } from "@/context/AgentContext";

export function useStewardChat() {
  const { stewardMessages, sendStewardMessage, connected } = useAgent();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stewardMessages.length]);

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
    bottomRef,
    handleKeyDown,
    input,
    sending,
    sendMessage,
    setInput,
    stewardMessages,
  };
}
