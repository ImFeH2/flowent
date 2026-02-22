import {
  useMemo,
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Send,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { AgentTree } from "@/components/AgentTree";
import { useAgent } from "@/context/AgentContext";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/MarkdownContent";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { stateBadgeColor } from "@/lib/constants";

export function HomePage() {
  const { agents, connected, selectedAgentId, selectAgent } = useAgent();
  const [panelOpen, setPanelOpen] = useState(true);

  const metrics = useMemo(() => {
    const states = Array.from(agents.values()).reduce(
      (acc, agent) => {
        acc[agent.state] = (acc[agent.state] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return {
      total: agents.size,
      running: states.running ?? 0,
      idle: states.idle ?? 0,
    };
  }, [agents]);

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) : null;
  const panelVisible = panelOpen || !!selectedAgent;

  const togglePanel = () => {
    if (panelVisible) {
      if (selectedAgentId) {
        selectAgent(null);
      }
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
  };

  return (
    <div className="relative h-full overflow-hidden rounded-[1.65rem]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(63,63,70,0.26),transparent_56%),radial-gradient(ellipse_at_bottom,rgba(24,24,27,0.4),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.86))]" />

      <div className="absolute inset-0">
        <AgentTree />
      </div>

      <div className="absolute left-4 top-4 z-30 flex max-w-[70%] flex-wrap items-center gap-2 sm:left-16">
        <BadgeChip>
          <Radio
            className={cn(
              "size-3",
              connected ? "text-emerald-400" : "text-amber-400",
            )}
          />
          {connected ? "Live" : "Reconnecting"}
        </BadgeChip>
        <BadgeChip>
          <Sparkles className="size-3 text-primary" />
          {metrics.total} nodes
        </BadgeChip>
        <BadgeChip>{metrics.running} RUNNING</BadgeChip>
        <BadgeChip>{metrics.idle} IDLE</BadgeChip>
      </div>

      <motion.button
        type="button"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        onClick={togglePanel}
        className="absolute right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/70 text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-lg transition-colors hover:text-foreground"
        title={panelVisible ? "Hide panel" : "Show panel"}
      >
        {panelVisible ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </motion.button>

      <AnimatePresence>
        {panelVisible && (
          <motion.aside
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="absolute bottom-4 right-4 top-16 z-30 w-[min(92vw,420px)] rounded-2xl border border-white/10 bg-black/70 shadow-[0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur-xl"
          >
            <div className="flex h-full flex-col overflow-hidden rounded-2xl">
              {selectedAgent ? (
                <AgentDetailPanel
                  agent={selectedAgent}
                  onClose={() => selectAgent(null)}
                />
              ) : (
                <StewardChatPanel />
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function BadgeChip({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-lg">
      {children}
    </div>
  );
}

function AgentDetailPanel({
  agent,
  onClose,
}: {
  agent: NonNullable<ReturnType<typeof useAgent>["agents"]> extends Map<
    string,
    infer V
  >
    ? V
    : never;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15">
            {agent.node_type === "steward" ? (
              <Shield className="size-4 text-primary" />
            ) : agent.node_type === "conductor" ? (
              <Sparkles className="size-4 text-primary" />
            ) : (
              <Bot className="size-4 text-primary" />
            )}
          </div>
          <div>
            <p className="font-semibold">{agent.name || agent.node_type}</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {agent.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-xl border border-white/10 bg-black/45 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <div className="mt-2">
            <Badge variant="outline" className={stateBadgeColor[agent.state]}>
              {agent.state.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/45 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connections
          </p>
          <p className="mt-2 text-sm text-foreground">
            {agent.connections.length} connected nodes
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/45 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Todos
          </p>
          <div className="mt-2 space-y-2">
            {agent.todos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No todos</p>
            ) : (
              agent.todos.slice(0, 6).map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      todo.done ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  <span
                    className={
                      todo.done ? "line-through text-muted-foreground" : ""
                    }
                  >
                    {todo.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StewardChatPanel() {
  const { stewardMessages, sendStewardMessage, connected } = useAgent();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  });

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15">
          <Shield className="size-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Steward</p>
          <p className="text-[11px] text-muted-foreground">
            {connected ? "Online" : "Connecting..."}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {stewardMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-xl border border-dashed border-white/15 bg-black/45 p-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
              <MessageSquare className="size-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Start a conversation</p>
              <p className="max-w-[200px] text-[11px] text-muted-foreground">
                Ask the Steward to plan tasks, summarize progress, or coordinate
                next steps.
              </p>
            </div>
          </div>
        )}

        {stewardMessages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`flex ${msg.from === "human" ? "justify-end" : "justify-start"}`}
          >
            {msg.from === "steward" && (
              <div className="flex max-w-[85%] items-start gap-2">
                <Shield className="mt-1 size-4 shrink-0 text-primary" />
                <div className="rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-sm text-foreground">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            )}
            {msg.from === "human" && (
              <div className="max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
                {msg.content}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the Steward..."
            rows={1}
            className="min-h-[40px] flex-1 resize-none rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
