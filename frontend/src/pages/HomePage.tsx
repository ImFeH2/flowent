import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  AssistantChatComposer,
  AssistantChatMessages,
} from "@/components/AssistantChatContent";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { useAgentDetail } from "@/hooks/useAgentDetail";
import { Badge } from "@/components/ui/badge";
import { getNodeLabel, stateBadgeColor } from "@/lib/constants";
import {
  hasCachedPanelWidth,
  usePanelDrag,
  usePanelWidth,
} from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";

const WORKSPACE_PANEL_ID = "workspace-panel-width";
const MIN_PANEL_WIDTH = 320;
const MIN_GRAPH_WIDTH = 320;
const MAX_PANEL_WIDTH = 1400;

export function HomePage() {
  const { agents, connected } = useAgentRuntime();
  const { selectedAgentId, selectAgent } = useAgentUI();
  const [panelOpen, setPanelOpen] = useState(true);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setStoredPanelWidth] = usePanelWidth(
    WORKSPACE_PANEL_ID,
    520,
    MIN_PANEL_WIDTH,
    MAX_PANEL_WIDTH,
  );
  const setPanelWidth = useCallback(
    (nextWidth: number) => {
      const containerWidth =
        workspaceRef.current?.clientWidth ??
        (typeof window === "undefined" ? nextWidth : window.innerWidth);
      const maxWidth = Math.max(
        MIN_PANEL_WIDTH,
        containerWidth - MIN_GRAPH_WIDTH,
      );
      setStoredPanelWidth(Math.min(nextWidth, maxWidth));
    },
    [setStoredPanelWidth],
  );
  const { isDragging, startDrag } = usePanelDrag(
    panelWidth,
    setPanelWidth,
    "left",
  );

  useLayoutEffect(() => {
    if (hasCachedPanelWidth(WORKSPACE_PANEL_ID)) {
      return;
    }
    const containerWidth = workspaceRef.current?.clientWidth;
    if (!containerWidth) {
      return;
    }
    setPanelWidth(containerWidth / 2);
  }, [setPanelWidth]);

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setPanelWidth(panelWidth);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [panelWidth, setPanelWidth]);

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
    <div
      ref={workspaceRef}
      className="relative flex h-full overflow-hidden rounded-[1rem] border border-white/6 bg-[linear-gradient(180deg,rgba(10,14,22,0.82),rgba(7,10,16,0.78))] shadow-[0_16px_42px_-32px_rgba(0,0,0,0.78)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_16%,transparent_82%,rgba(255,255,255,0.015))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_14%,rgba(92,162,255,0.09),transparent_0,transparent_28%),radial-gradient(circle_at_70%_86%,rgba(255,255,255,0.028),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.016),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-[linear-gradient(90deg,transparent,rgba(5,7,12,0.24))]" />

        <div className="relative flex-1">
          <AgentGraph />
        </div>

        <div className="absolute right-5 top-5 z-30 sm:right-6 sm:top-6">
          <PanelToggleButton expanded={panelVisible} onClick={togglePanel} />
        </div>

        <div className="absolute left-5 top-5 z-30 flex max-w-[75%] flex-wrap items-center gap-2 sm:left-6 sm:top-6">
          <BadgeChip tone="primary">
            <Radio
              className={cn(
                "size-3",
                connected ? "text-emerald-400" : "text-amber-400",
              )}
            />
            {connected ? "Live" : "Reconnecting"}
          </BadgeChip>
          <BadgeChip>
            {metrics.total} nodes
            <span className="text-muted-foreground/50">/</span>
            {metrics.running} running
            <span className="text-muted-foreground/50">/</span>
            {metrics.idle} idle
          </BadgeChip>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {panelVisible && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-20 shrink-0 border-l border-white/6 bg-[linear-gradient(180deg,rgba(12,16,24,0.88),rgba(9,12,19,0.82))] shadow-[-12px_0_28px_-24px_rgba(0,0,0,0.72)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.026),transparent_14%,transparent_82%,rgba(255,255,255,0.012))]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
            <PanelResizer
              position="left"
              isDragging={isDragging}
              onMouseDown={startDrag}
            />
            <div
              className="flex h-full flex-col overflow-hidden"
              style={{ width: `${panelWidth}px` }}
            >
              <div className="relative flex-1 overflow-hidden">
                <motion.div
                  animate={{
                    opacity: selectedAgent ? 0 : 1,
                    x: selectedAgent ? -8 : 0,
                  }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "absolute inset-0 flex h-full flex-col",
                    selectedAgent && "pointer-events-none",
                  )}
                  aria-hidden={selectedAgent ? true : undefined}
                >
                  <AssistantChatPanel />
                </motion.div>

                <AnimatePresence>
                  {selectedAgent ? (
                    <motion.div
                      key={selectedAgent.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 flex h-full flex-col bg-[linear-gradient(180deg,rgba(14,18,27,0.44),rgba(10,13,20,0.38))]"
                    >
                      <AgentDetailPanel
                        agent={selectedAgent}
                        onClose={() => selectAgent(null)}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function BadgeChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "primary";
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 rounded-[0.85rem] border px-3 py-1.5 text-[11px] font-medium shadow-[0_10px_24px_-20px_rgba(0,0,0,0.76)] backdrop-blur-lg",
        tone === "primary"
          ? "border-primary/12 bg-primary/[0.06] text-foreground"
          : "border-white/6 bg-black/[0.14] text-foreground",
      )}
    >
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
  const { agents } = useAgentRuntime();
  const { detail, error, loading } = useAgentDetail(agent.id);
  const detailState = detail?.state ?? agent.state;
  const detailConnections = detail?.connections ?? agent.connections;
  const detailTodos = detail?.todos ?? agent.todos;
  const detailHistory = detail?.history ?? [];
  const detailRoleName = detail?.role_name ?? agent.role_name;
  const detailTools = detail?.tools ?? [];
  const detailWriteDirs = detail?.write_dirs ?? [];
  const detailAllowNetwork = detail?.allow_network ?? false;
  const label = getNodeLabel({
    name: agent.name,
    roleName: agent.role_name,
    nodeType: agent.node_type,
  });
  const connectionItems = detailConnections.map((connectionId) => {
    const connectedAgent = agents.get(connectionId);
    return {
      id: connectionId,
      label: connectedAgent
        ? getNodeLabel({
            name: connectedAgent.name,
            roleName: connectedAgent.role_name,
            nodeType: connectedAgent.node_type,
          })
        : connectionId.slice(0, 8),
    };
  });

  return (
    <>
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/8">
            {agent.node_type === "assistant" ? (
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
        <div className="space-y-4">
          <div className="grid gap-4 border-b border-white/6 pb-4 sm:grid-cols-3">
            <div className="min-w-0">
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

            <div className="min-w-0 sm:border-l sm:border-white/6 sm:pl-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Connections
              </p>
              <p className="mt-2 text-sm text-foreground">
                {detailConnections.length} connected nodes
              </p>
            </div>

            <div className="min-w-0 sm:border-l sm:border-white/6 sm:pl-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Role
              </p>
              <p className="mt-2 text-sm text-foreground">
                {detailRoleName ?? "None"}
              </p>
            </div>
          </div>

          <DetailSection title="Connections">
            {connectionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No direct connections
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectionItems.map((connection) => (
                  <span
                    key={connection.id}
                    className="rounded-md bg-white/[0.04] px-2 py-1 text-xs text-foreground"
                  >
                    {connection.label}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Tools">
            {detailTools.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tools configured
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detailTools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-md bg-white/[0.04] px-2 py-1 text-xs font-mono text-foreground"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Permissions">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Network
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {detailAllowNetwork ? "Enabled" : "Disabled"}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Write Dirs
                </p>
                {detailWriteDirs.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No write access
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {detailWriteDirs.map((path) => (
                      <p
                        key={path}
                        className="rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-foreground"
                      >
                        {path}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Todos">
            <div className="space-y-2">
              {detailTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No todos</p>
              ) : (
                detailTodos.slice(0, 6).map((todo) => (
                  <div
                    key={todo.text}
                    className="flex min-w-0 items-center gap-2 text-sm text-foreground"
                  >
                    <span className="size-2 rounded-full bg-amber-500" />
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {todo.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </DetailSection>

          <div className="border-t border-white/6 pt-4">
            <div className="px-0 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                History
              </p>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, index) => (
                  <div
                    key={index}
                    className="h-12 rounded-md skeleton-shimmer"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : detailHistory.length === 0 ? (
              <div className="text-sm text-muted-foreground">
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

function AssistantChatPanel() {
  const { agents } = useAgentRuntime();
  const {
    connected,
    handleKeyDown,
    input,
    onMessagesScroll,
    scrollRef,
    sending,
    sendMessage,
    setInput,
    timelineItems,
  } = useAssistantChat();
  const assistantRoleName = agents.get("assistant")?.role_name ?? null;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/6 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/8">
          <Shield className="size-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Assistant</p>
          <p className="text-[11px] text-muted-foreground">
            {assistantRoleName
              ? `Role: ${assistantRoleName} · ${connected ? "Online" : "Connecting..."}`
              : connected
                ? "Online"
                : "Connecting..."}
          </p>
        </div>
      </div>

      <AssistantChatMessages
        items={timelineItems}
        onScroll={onMessagesScroll}
        scrollRef={scrollRef}
        variant="workspace"
      />

      <AssistantChatComposer
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
        "pointer-events-auto flex size-10 items-center justify-center rounded-lg bg-black/[0.16] text-muted-foreground backdrop-blur-lg transition-all hover:bg-white/[0.05] hover:text-foreground",
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
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-white/[0.045] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-white/6 pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}
