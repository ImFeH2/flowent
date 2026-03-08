import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { AgentGraph } from "@/components/AgentGraph";
import { HistoryView } from "@/components/HistoryView";
import type { Node } from "@/types";
import { useAgentRuntime, useAgentUI } from "@/context/AgentContext";
import { cn } from "@/lib/utils";
import {
  StewardChatComposer,
  StewardChatMessages,
} from "@/components/StewardChatContent";
import { useStewardChat } from "@/hooks/useStewardChat";
import { useAgentDetail } from "@/hooks/useAgentDetail";
import { Badge } from "@/components/ui/badge";
import { stateBadgeColor } from "@/lib/constants";

const floatingPanelToggleClass = "absolute right-7 top-[4.25rem] z-40";

export function HomePage() {
  const { agents, connected } = useAgentRuntime();
  const { selectedAgentId, selectAgent } = useAgentUI();
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

      <div className="absolute inset-x-0 top-0 z-30 border-b border-glass-border bg-surface-overlay py-2.5 px-5 backdrop-blur-sm sm:px-6">
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

      <AnimatePresence>
        {!panelVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={floatingPanelToggleClass}
          >
            <PanelToggleButton
              expanded={false}
              onClick={togglePanel}
              className="shadow-md border-glass-border/50 bg-glass-bg/90 hover:bg-surface-3/90"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {panelVisible && (
          <motion.aside
            initial={{ opacity: 0, x: 20, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute bottom-3 right-3 top-14 z-30 w-[min(92vw,420px)] rounded-lg border border-glass-border bg-glass-bg shadow-2xl backdrop-blur-md"
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
                      onCollapse={togglePanel}
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
                    <StewardChatPanel onCollapse={togglePanel} />
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
  onCollapse,
}: {
  agent: Node;
  onClose: () => void;
  onCollapse: () => void;
}) {
  const { detail, error, loading } = useAgentDetail(agent.id);
  const detailState = detail?.state ?? agent.state;
  const detailConnections = detail?.connections ?? agent.connections;
  const detailTodos = detail?.todos ?? agent.todos;
  const detailHistory = detail?.history ?? [];

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
        <div className="flex items-center gap-1.5">
          <PanelToggleButton expanded onClick={onCollapse} />
          <PanelActionButton title="Close details" onClick={onClose}>
            <X className="size-4" />
          </PanelActionButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-glass-border bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </p>
              <div className="mt-2">
                <Badge
                  variant="outline"
                  className={stateBadgeColor[detailState]}
                >
                  {detailState.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-glass-border bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Connections
              </p>
              <p className="mt-2 text-sm text-foreground">
                {detailConnections.length} connected nodes
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-glass-border bg-surface-2 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Todos
            </p>
            <div className="mt-2 space-y-2">
              {detailTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No todos</p>
              ) : (
                detailTodos.slice(0, 6).map((todo) => (
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

          <div className="overflow-hidden rounded-lg border border-glass-border bg-surface-2">
            <div className="border-b border-glass-border px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                History
              </p>
            </div>

            {loading ? (
              <div className="space-y-2 p-3">
                {[...Array(4)].map((_, index) => (
                  <div
                    key={index}
                    className="h-12 rounded-md skeleton-shimmer"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="p-3 text-sm text-destructive">{error}</div>
            ) : detailHistory.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No history yet.
              </div>
            ) : (
              <HistoryView history={detailHistory} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

interface StewardChatPanelProps {
  onCollapse: () => void;
}

function StewardChatPanel({ onCollapse }: StewardChatPanelProps) {
  const {
    bottomRef,
    connected,
    handleKeyDown,
    input,
    sending,
    sendMessage,
    setInput,
    stewardMessages,
  } = useStewardChat();

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
        <PanelToggleButton expanded onClick={onCollapse} />
      </div>

      <StewardChatMessages
        bottomRef={bottomRef}
        messages={stewardMessages}
        variant="workspace"
      />

      <StewardChatComposer
        disabled={!input.trim() || sending}
        input={input}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        onSend={() => void sendMessage()}
        variant="workspace"
      />
    </>
  );
}

interface PanelActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  title: string;
}

interface PanelToggleButtonProps {
  expanded: boolean;
  onClick: () => void;
  className?: string;
}

function PanelToggleButton({
  expanded,
  onClick,
  className,
}: PanelToggleButtonProps) {
  const title = expanded ? "Hide panel" : "Show panel";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex size-8 items-center justify-center rounded-md border border-glass-border bg-surface-overlay/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-surface-3 hover:text-foreground",
        className,
      )}
    >
      <span className="flex transition-transform duration-200">
        {expanded ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </span>
    </button>
  );
}

function PanelActionButton({
  children,
  onClick,
  title,
}: PanelActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
    >
      {children}
    </button>
  );
}
