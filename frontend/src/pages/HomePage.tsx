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
import { AgentGraph } from "@/components/AgentGraph";
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
    <div className="relative h-full overflow-hidden rounded-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--surface-3),transparent_48%)] opacity-30" />

      <div className="absolute inset-0">
        <AgentGraph />
      </div>

      <div className="absolute inset-x-0 top-0 z-30 border-b border-glass-border bg-surface-overlay px-5 py-2.5 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground/95">
              Agent Workspace
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Focused graph view with floating details panel
            </p>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
            <span>{metrics.total} nodes</span>
            <span className="text-muted-foreground/30">/</span>
            <span>{metrics.running} RUNNING</span>
          </div>
        </div>
      </div>

      <div className="absolute left-4 top-14 z-30 flex max-w-[75%] flex-wrap items-center gap-2 sm:left-6">
        <BadgeChip>
          <Radio
            className={cn(
              "size-3",
              connected ? "text-emerald-400" : "text-amber-400",
            )}
          />
          {connected ? "Live" : "Reconnecting"}
          <span className="text-muted-foreground/50">·</span>
          {metrics.total} nodes · {metrics.running} running · {metrics.idle}{" "}
          idle
        </BadgeChip>
      </div>

      <motion.button
        type="button"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        onClick={togglePanel}
        className="absolute right-4 top-14 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-glass-border bg-surface-overlay text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-surface-3 hover:text-foreground"
        title={panelVisible ? "Hide panel" : "Show panel"}
      >
        {panelVisible ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </motion.button>

      <AnimatePresence mode="wait">
        {panelVisible && (
          <motion.aside
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="absolute bottom-3 right-3 top-24 z-30 w-[min(92vw,420px)] rounded-lg border border-glass-border bg-glass-bg shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-sm"
          >
            <div className="flex h-full flex-col overflow-hidden rounded-lg">
              <AnimatePresence mode="wait">
                {selectedAgent ? (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex h-full flex-col"
                  >
                    <AgentDetailPanel
                      agent={selectedAgent}
                      onClose={() => selectAgent(null)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex h-full flex-col"
                  >
                    <StewardChatPanel />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function BadgeChip({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-glass-border bg-surface-overlay px-2.5 py-1 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-sm">
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
      <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/12">
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
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-lg border border-glass-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <div className="mt-2">
            <Badge variant="outline" className={stateBadgeColor[agent.state]}>
              {agent.state.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-glass-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connections
          </p>
          <p className="mt-2 text-sm text-foreground">
            {agent.connections.length} connected nodes
          </p>
        </div>

        <div className="rounded-lg border border-glass-border bg-surface-2 p-3">
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
  const messageCount = stewardMessages.length;

  useEffect(() => {
    if (messageCount < 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

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
      <div className="flex items-center gap-3 border-b border-glass-border px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/12">
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
          <div className="flex h-full flex-col items-center justify-center space-y-3 rounded-lg border border-dashed border-glass-border bg-surface-2 p-4 text-center">
            <div className="flex size-11 items-center justify-center rounded-md bg-surface-3">
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
                <div className="rounded-md border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            )}
            {msg.from === "human" && (
              <div className="max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-lg">
                {msg.content}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-glass-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the Steward..."
            rows={1}
            className="min-h-[40px] flex-1 resize-none rounded-md border border-glass-border bg-surface-2 px-3 py-2 text-sm text-foreground transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg transition-all active:scale-[0.98] hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
