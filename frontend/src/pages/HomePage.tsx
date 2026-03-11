import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bot,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Shield,
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
import { getNodeLabel, stateBadgeColor } from "@/lib/constants";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";

export function HomePage() {
  const { agents, connected } = useAgentRuntime();
  const { selectedAgentId, selectAgent } = useAgentUI();
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = usePanelWidth(
    "workspace-panel-width",
    380,
    280,
    600,
  );
  const { isDragging, startDrag } = usePanelDrag(
    panelWidth,
    setPanelWidth,
    "left",
  );

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
    <div className="relative flex h-full overflow-hidden rounded-xl bg-surface-1">
      {/* Main Graph Area */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--surface-3),transparent_48%)] opacity-30 z-0" />

        <div className="relative flex-1">
          <AgentGraph />
        </div>

        <div className="absolute right-5 top-5 z-30 sm:right-6 sm:top-6">
          <PanelToggleButton expanded={panelVisible} onClick={togglePanel} />
        </div>

        <div className="absolute left-5 top-5 z-30 flex max-w-[75%] flex-wrap items-center gap-2 sm:left-6 sm:top-6">
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
      </div>

      {/* Side Panel Area */}
      <AnimatePresence initial={false}>
        {panelVisible && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="z-20 shrink-0 border-l border-border bg-surface-2 relative"
          >
            <PanelResizer
              position="left"
              isDragging={isDragging}
              onMouseDown={startDrag}
            />
            <div
              className="flex h-full flex-col overflow-hidden"
              style={{ width: `${panelWidth}px` }}
            >
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
  agent: Node;
  onClose: () => void;
}) {
  const { detail, error, loading } = useAgentDetail(agent.id);
  const detailState = detail?.state ?? agent.state;
  const detailConnections = detail?.connections ?? agent.connections;
  const detailTodos = detail?.todos ?? agent.todos;
  const detailHistory = detail?.history ?? [];
  const label = getNodeLabel({
    name: agent.name,
    roleName: agent.role_name,
    nodeType: agent.node_type,
  });

  return (
    <>
      <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/12">
            {agent.node_type === "steward" ? (
              <Shield className="size-4 text-primary" />
            ) : (
              <Bot className="size-4 text-primary" />
            )}
          </div>
          <div>
            <p className="font-semibold">{label}</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {agent.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
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
                    key={todo.text}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span className="size-2 rounded-full bg-amber-500" />
                    <span>{todo.text}</span>
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

function StewardChatPanel() {
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
        "pointer-events-auto flex size-8 items-center justify-center rounded-md border border-glass-border bg-surface-overlay text-muted-foreground shadow-lg backdrop-blur-sm transition-all hover:bg-surface-3 hover:text-foreground",
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
