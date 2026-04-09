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
  CircuitBoard,
  FilePlus2,
  Link2,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  SendHorizontal,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AgentGraph } from "@/components/AgentGraph";
import { HistoryView } from "@/components/HistoryView";
import type { HistoryEntry, Node } from "@/types";
import {
  useAgentActivityRuntime,
  useAgentConnectionRuntime,
  useAgentHistoryRuntime,
  useAgentNodesRuntime,
  useAgentTabsRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { cn } from "@/lib/utils";
import {
  AssistantChatComposer,
  AssistantChatMessages,
} from "@/components/AssistantChatContent";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { useAgentDetail } from "@/hooks/useAgentDetail";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { Badge } from "@/components/ui/badge";
import { getNodeLabel, stateBadgeColor } from "@/lib/constants";
import {
  hasCachedPanelWidth,
  usePanelDrag,
  usePanelWidth,
} from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { getAssistantNode } from "@/lib/assistant";
import {
  createTabEdgeRequest,
  createTabNodeRequest,
  createTabRequest,
  deleteTabRequest,
  dispatchNodeMessageRequest,
  interruptNode,
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  WorkspaceCommandDialog,
  WorkspaceDialogField,
  WorkspaceDialogMeta,
} from "@/components/WorkspaceCommandDialog";

const WORKSPACE_PANEL_ID = "workspace-panel-width";
const MIN_PANEL_WIDTH = 296;
const MIN_FORMATION_WIDTH = 300;
const MAX_PANEL_WIDTH = 960;
const DEFAULT_PANEL_RATIO = 0.34;
const DEFAULT_PANEL_WIDTH = 448;
const COMPACT_PANEL_MIN_WIDTH = 300;

type WorkspaceDialogKind =
  | "create-tab"
  | "create-agent"
  | "connect-agents"
  | "send-task"
  | "delete-tab"
  | null;

type AssistantPanelView = "chat" | "detail";

export function HomePage() {
  const { agents } = useAgentNodesRuntime();
  const { tabs } = useAgentTabsRuntime();
  const { connected } = useAgentConnectionRuntime();
  const { activeToolCalls } = useAgentActivityRuntime();
  const { streamingDeltas } = useAgentHistoryRuntime();
  const {
    activeTabId,
    pendingAssistantMessages,
    selectedAgentId,
    selectAgent,
    setActiveTabId,
  } = useAgentUI();
  const [panelOpen, setPanelOpen] = useState(true);
  const [assistantPanelView, setAssistantPanelView] =
    useState<AssistantPanelView>("chat");
  const [interruptingAssistant, setInterruptingAssistant] = useState(false);
  const isCompactWorkspace = useMediaQuery("(max-width: 1180px)");
  const [activeDialog, setActiveDialog] = useState<WorkspaceDialogKind>(null);
  const [pendingAction, setPendingAction] = useState<WorkspaceDialogKind>(null);
  const [createTabTitle, setCreateTabTitle] = useState("");
  const [createTabGoal, setCreateTabGoal] = useState("");
  const [createAgentRoleName, setCreateAgentRoleName] = useState("Worker");
  const [createAgentName, setCreateAgentName] = useState("");
  const [connectSourceId, setConnectSourceId] = useState("");
  const [connectTargetId, setConnectTargetId] = useState("");
  const [taskMessageDraft, setTaskMessageDraft] = useState("");
  const [deleteTabTarget, setDeleteTabTarget] = useState<{
    id: string;
    title: string;
    nodeCount?: number;
  } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setStoredPanelWidth] = usePanelWidth(
    WORKSPACE_PANEL_ID,
    DEFAULT_PANEL_WIDTH,
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
        containerWidth - MIN_FORMATION_WIDTH,
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
    setPanelWidth(containerWidth * DEFAULT_PANEL_RATIO);
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

  useEffect(() => {
    if (isCompactWorkspace) {
      setPanelOpen(false);
    }
  }, [isCompactWorkspace]);

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) : null;
  const activeTab = activeTabId ? (tabs.get(activeTabId) ?? null) : null;
  const tabAgents = useMemo(
    () =>
      Array.from(agents.values()).filter(
        (agent) =>
          agent.node_type !== "assistant" && agent.tab_id === activeTabId,
      ),
    [activeTabId, agents],
  );
  const tabAgentOptions = useMemo(
    () =>
      tabAgents.map((agent) => ({
        id: agent.id,
        label: getNodeLabel({
          name: agent.name,
          roleName: agent.role_name,
          nodeType: agent.node_type,
        }),
      })),
    [tabAgents],
  );
  const selectedAgentLabel = selectedAgent
    ? getNodeLabel({
        name: selectedAgent.name,
        roleName: selectedAgent.role_name,
        nodeType: selectedAgent.node_type,
      })
    : null;
  const panelVisible = panelOpen || !!selectedAgent;
  const resolvedPanelWidth = useMemo(() => {
    if (!isCompactWorkspace) {
      return panelWidth;
    }
    const containerWidth =
      workspaceRef.current?.clientWidth ??
      (typeof window === "undefined" ? panelWidth : window.innerWidth);

    return Math.min(
      panelWidth,
      Math.max(COMPACT_PANEL_MIN_WIDTH, containerWidth - 24),
    );
  }, [isCompactWorkspace, panelWidth]);
  const assistantNode = getAssistantNode(agents);
  const assistantId = assistantNode?.id ?? null;
  const assistantDetailVisible =
    assistantPanelView === "detail" && assistantNode !== null;
  const assistantPanelRunning = useMemo(() => {
    const assistantDeltas = assistantId
      ? (streamingDeltas.get(assistantId) ?? [])
      : [];

    return (
      connected &&
      (pendingAssistantMessages.length > 0 ||
        assistantNode?.state === "running" ||
        (assistantId ? activeToolCalls.has(assistantId) : false) ||
        assistantDeltas.length > 0)
    );
  }, [
    activeToolCalls,
    assistantNode,
    connected,
    pendingAssistantMessages.length,
    streamingDeltas,
  ]);

  const handleOpenAssistantDetails = useCallback(() => {
    setPanelOpen(true);
    setAssistantPanelView("detail");
  }, []);

  const handleCloseAssistantDetails = useCallback(() => {
    setAssistantPanelView("chat");
  }, []);

  const handleInterruptAssistant = useCallback(() => {
    if (!assistantId || interruptingAssistant) {
      return;
    }
    setInterruptingAssistant(true);
    interruptNode(assistantId)
      .catch(() => {
        toast.error("Failed to interrupt assistant");
      })
      .finally(() => {
        setInterruptingAssistant(false);
      });
  }, [assistantId, interruptingAssistant]);

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

  const renderAssistantPanel = () => {
    if (assistantDetailVisible && assistantNode) {
      return (
        <AgentDetailPanel
          agent={assistantNode}
          onClose={handleCloseAssistantDetails}
        />
      );
    }

    return (
      <AssistantChatPanel
        interrupting={interruptingAssistant}
        onInterrupt={handleInterruptAssistant}
        onOpenDetails={handleOpenAssistantDetails}
      />
    );
  };

  const openCreateTabDialog = () => {
    setCreateTabTitle("");
    setCreateTabGoal("");
    setActiveDialog("create-tab");
  };

  const handleCreateTab = async () => {
    const title = createTabTitle.trim();
    if (!title) {
      return;
    }
    setPendingAction("create-tab");
    try {
      const tab = await createTabRequest(title, createTabGoal.trim());
      setActiveTabId(tab.id);
      setActiveDialog(null);
      setCreateTabTitle("");
      setCreateTabGoal("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create tab",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const openCreateAgentDialog = () => {
    if (!activeTabId) {
      toast.error("Create or select a tab first");
      return;
    }
    setCreateAgentRoleName("Worker");
    setCreateAgentName("");
    setActiveDialog("create-agent");
  };

  const handleCreateAgent = async () => {
    const roleName = createAgentRoleName.trim();
    if (!activeTabId || !roleName) {
      return;
    }
    setPendingAction("create-agent");
    try {
      await createTabNodeRequest(activeTabId, {
        role_name: roleName,
        name: createAgentName.trim() || undefined,
      });
      setActiveDialog(null);
      setCreateAgentRoleName("Worker");
      setCreateAgentName("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create agent",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const requestDeleteTab = (
    tabId: string,
    title: string,
    nodeCount?: number,
  ) => {
    setDeleteTabTarget({ id: tabId, title, nodeCount });
  };

  const handleDeleteTab = async () => {
    if (!deleteTabTarget) {
      return;
    }
    setPendingAction("delete-tab");
    try {
      await deleteTabRequest(deleteTabTarget.id);
      setDeleteTabTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete tab",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const openConnectDialog = () => {
    if (!activeTabId) {
      toast.error("Create or select a tab first");
      return;
    }
    if (tabAgentOptions.length < 2) {
      toast.error("Add at least two agents before creating a connection");
      return;
    }
    const selectedSourceId =
      selectedAgent && selectedAgent.tab_id === activeTabId
        ? selectedAgent.id
        : tabAgentOptions[0]?.id;
    const initialTargetId =
      tabAgentOptions.find((agent) => agent.id !== selectedSourceId)?.id ?? "";
    if (!selectedSourceId || !initialTargetId) {
      return;
    }
    setConnectSourceId(selectedSourceId);
    setConnectTargetId(initialTargetId);
    setActiveDialog("connect-agents");
  };

  const handleConnectAgents = async () => {
    if (!activeTabId || !connectSourceId || !connectTargetId) {
      return;
    }
    if (connectSourceId === connectTargetId) {
      toast.error("Choose two different agents");
      return;
    }
    setPendingAction("connect-agents");
    try {
      await createTabEdgeRequest(activeTabId, connectSourceId, connectTargetId);
      setActiveDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to connect agents",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const openTaskDialog = () => {
    if (
      !selectedAgentId ||
      !selectedAgent ||
      selectedAgent.node_type === "assistant"
    ) {
      toast.error("Select an agent first");
      return;
    }
    setTaskMessageDraft("");
    setActiveDialog("send-task");
  };

  const handleDispatchTask = async () => {
    const content = taskMessageDraft.trim();
    if (!selectedAgentId || !content) {
      return;
    }
    setPendingAction("send-task");
    try {
      await dispatchNodeMessageRequest(selectedAgentId, content, "human");
      setTaskMessageDraft("");
      setActiveDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send task",
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      ref={workspaceRef}
      className="relative isolate flex h-full overflow-hidden rounded-[0.9rem] border border-white/6 bg-[linear-gradient(180deg,rgba(12,12,13,0.88),rgba(8,8,9,0.84))] shadow-[0_16px_42px_-34px_rgba(0,0,0,0.78)] [contain:paint]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.018),transparent_14%,transparent_84%,rgba(255,255,255,0.01))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative z-30 border-b border-white/8 bg-[rgba(12,12,13,0.84)]">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/8" />
          <div className="pointer-events-auto relative z-10 flex items-end gap-1 overflow-x-auto px-2.5 pb-0 pr-14 pt-2 scrollbar-none">
            {Array.from(tabs.values()).map((tab) => (
              <div
                key={tab.id}
                className="group relative min-w-[116px] max-w-[190px] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    "relative -mb-px flex h-9 w-full items-center rounded-t-[9px] border px-3 pr-9 text-left text-[12px] font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    activeTabId === tab.id
                      ? "border-white/8 border-b-[rgba(12,12,13,0.84)] bg-white/[0.035] text-white"
                      : "border-transparent bg-transparent text-white/52 hover:border-white/6 hover:bg-white/[0.022] hover:text-white/82",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-3 bottom-0 h-px rounded-full transition-opacity duration-150",
                      activeTabId === tab.id
                        ? "bg-white/80 opacity-100"
                        : "bg-white/18 opacity-0 group-hover:opacity-100",
                    )}
                  />
                  <div className="truncate leading-tight">{tab.title}</div>
                </button>
                <button
                  type="button"
                  title="Delete tab"
                  aria-label={`Delete ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteTab(tab.id, tab.title, tab.node_count);
                  }}
                  className={cn(
                    "absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-md p-1 text-white/34 transition-[opacity,color,background-color] duration-150 hover:bg-white/[0.04] hover:text-white/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    activeTabId === tab.id
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              aria-label="Create tab"
              onClick={() => {
                openCreateTabDialog();
              }}
              className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-white/8 bg-transparent text-white/58 transition-[background-color,border-color,color] duration-150 hover:border-white/12 hover:bg-white/[0.035] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.03),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.01),transparent_22%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-[linear-gradient(90deg,transparent,rgba(8,8,9,0.14))]" />

        <div className="relative flex-1">
          <AgentGraph />
          <div
            className={cn(
              "absolute top-4 z-40 flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-1.5",
              isCompactWorkspace ? "left-14" : "left-4",
            )}
          >
            <BadgeChip tone="primary">
              <Radio
                className={cn(
                  "size-3.5 shrink-0",
                  connected
                    ? "text-graph-status-idle/88"
                    : "text-graph-status-initializing/38",
                )}
              />
              <span className="whitespace-nowrap">
                {connected ? "Live" : "Reconnecting"}
              </span>
            </BadgeChip>
          </div>

          <div className="pointer-events-auto absolute bottom-4 left-1/2 z-40 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center rounded-[14px] border border-white/10 bg-[rgba(12,12,13,0.76)] p-0.5 shadow-[0_12px_28px_-20px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <ToolbarButton
              disabled={!activeTabId}
              onClick={openCreateAgentDialog}
            >
              <Plus className="size-4 opacity-70" />
              Add Agent
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              disabled={!activeTabId || tabAgentOptions.length < 2}
              onClick={openConnectDialog}
            >
              <Link2 className="size-4 opacity-70" />
              Connect
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton
              disabled={
                !selectedAgent || selectedAgent.node_type === "assistant"
              }
              onClick={openTaskDialog}
            >
              <SendHorizontal className="size-4 opacity-70" />
              Send Task
            </ToolbarButton>
          </div>
        </div>

        <div className="absolute right-4 top-4 z-30 sm:right-5 sm:top-5">
          <PanelToggleButton expanded={panelVisible} onClick={togglePanel} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {panelVisible ? (
          isCompactWorkspace ? (
            [
              <motion.button
                key="workspace-panel-backdrop"
                type="button"
                aria-label="Close workspace panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 z-10 bg-black/20 backdrop-blur-[1px]"
                onClick={togglePanel}
              />,
              <motion.aside
                key="workspace-panel-sheet"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-y-2.5 right-2.5 z-20 shrink-0 overflow-hidden rounded-[0.95rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,15,0.94),rgba(11,11,12,0.92))] shadow-[-12px_0_28px_-24px_rgba(0,0,0,0.72)] backdrop-blur-xl"
                style={{ width: `${resolvedPanelWidth}px` }}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-0 z-20 border transition-[opacity,border-color,box-shadow] duration-300",
                    !selectedAgent && assistantPanelRunning
                      ? "animate-pulse border-white/12 opacity-100 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_28px_-14px_rgba(255,255,255,0.12)]"
                      : "border-transparent opacity-0",
                  )}
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.026),transparent_14%,transparent_82%,rgba(255,255,255,0.012))]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
                <div className="flex h-full flex-col overflow-hidden">
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
                      {renderAssistantPanel()}
                    </motion.div>

                    <AnimatePresence>
                      {selectedAgent ? (
                        <motion.div
                          key={selectedAgent.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute inset-0 flex h-full flex-col bg-[linear-gradient(180deg,rgba(18,18,19,0.58),rgba(12,12,13,0.48))]"
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
              </motion.aside>,
            ]
          ) : (
            <motion.aside
              key="workspace-panel-docked"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: resolvedPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-20 shrink-0 border-l border-white/6 bg-[linear-gradient(180deg,rgba(14,14,15,0.92),rgba(11,11,12,0.88))] shadow-[-12px_0_28px_-24px_rgba(0,0,0,0.72)] backdrop-blur-xl"
            >
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 z-20 border transition-[opacity,border-color,box-shadow] duration-300",
                  !selectedAgent && assistantPanelRunning
                    ? "animate-pulse border-white/12 opacity-100 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_28px_-14px_rgba(255,255,255,0.12)]"
                    : "border-transparent opacity-0",
                )}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.026),transparent_14%,transparent_82%,rgba(255,255,255,0.012))]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
              <PanelResizer
                position="left"
                isDragging={isDragging}
                onMouseDown={startDrag}
              />
              <div
                className="flex h-full flex-col overflow-hidden"
                style={{ width: `${resolvedPanelWidth}px` }}
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
                    {renderAssistantPanel()}
                  </motion.div>

                  <AnimatePresence>
                    {selectedAgent ? (
                      <motion.div
                        key={selectedAgent.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 flex h-full flex-col bg-[linear-gradient(180deg,rgba(18,18,19,0.58),rgba(12,12,13,0.48))]"
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
          )
        ) : null}
      </AnimatePresence>

      <WorkspaceCommandDialog
        open={activeDialog === "create-tab"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        icon={FilePlus2}
        eyebrow="Workspace"
        title="Create Task Tab"
        description="Open a persistent task workspace with a clear title and an optional goal so both you and the Assistant can revisit it later."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setActiveDialog(null)}
              disabled={pendingAction === "create-tab"}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateTab()}
              disabled={
                !createTabTitle.trim() || pendingAction === "create-tab"
              }
            >
              {pendingAction === "create-tab"
                ? "Creating..."
                : "Create Task Tab"}
            </Button>
          </>
        }
      >
        <WorkspaceDialogField label="Title" hint="Shown in the tab strip">
          <Input
            autoFocus
            aria-label="Tab title"
            value={createTabTitle}
            onChange={(event) => setCreateTabTitle(event.target.value)}
            placeholder="Release checklist"
            className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
        <WorkspaceDialogField label="Goal" hint="Optional">
          <Textarea
            value={createTabGoal}
            aria-label="Tab goal"
            onChange={(event) => setCreateTabGoal(event.target.value)}
            placeholder="Summarize the task or outcome this workspace should drive."
            className="min-h-[116px] rounded-[1rem] border-white/10 bg-black/14 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
      </WorkspaceCommandDialog>

      <WorkspaceCommandDialog
        open={activeDialog === "create-agent"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        icon={Bot}
        eyebrow="Agent Graph"
        title="Add Agent"
        description="Add a peer node to the current tab. Start with the role and optional display name, then wire it into the graph."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setActiveDialog(null)}
              disabled={pendingAction === "create-agent"}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateAgent()}
              disabled={
                !activeTabId ||
                !createAgentRoleName.trim() ||
                pendingAction === "create-agent"
              }
            >
              {pendingAction === "create-agent" ? "Adding..." : "Add Agent"}
            </Button>
          </>
        }
      >
        <WorkspaceDialogMeta>
          Adding to{" "}
          <span className="font-semibold text-white">
            {activeTab?.title ?? "No active tab"}
          </span>
        </WorkspaceDialogMeta>
        <WorkspaceDialogField label="Role" hint="Required">
          <Input
            autoFocus
            aria-label="Agent role"
            value={createAgentRoleName}
            onChange={(event) => setCreateAgentRoleName(event.target.value)}
            placeholder="Worker"
            className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
        <WorkspaceDialogField label="Display Name" hint="Optional">
          <Input
            value={createAgentName}
            aria-label="Agent display name"
            onChange={(event) => setCreateAgentName(event.target.value)}
            placeholder="Docs Worker"
            className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
      </WorkspaceCommandDialog>

      <WorkspaceCommandDialog
        open={activeDialog === "connect-agents"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        icon={CircuitBoard}
        eyebrow="Topology"
        title="Connect Agents"
        description="Create a directed edge between two peers in the current tab so they can message each other directly."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setActiveDialog(null)}
              disabled={pendingAction === "connect-agents"}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleConnectAgents()}
              disabled={
                !connectSourceId ||
                !connectTargetId ||
                connectSourceId === connectTargetId ||
                pendingAction === "connect-agents"
              }
            >
              {pendingAction === "connect-agents"
                ? "Connecting..."
                : "Create Edge"}
            </Button>
          </>
        }
      >
        <WorkspaceDialogMeta>
          {activeTab ? (
            <>
              Tab{" "}
              <span className="font-semibold text-white">
                {activeTab.title}
              </span>{" "}
              · {tabAgentOptions.length} agents available
            </>
          ) : (
            "No active tab"
          )}
        </WorkspaceDialogMeta>
        <WorkspaceDialogField label="Source" hint="Sends messages out">
          <Select
            value={connectSourceId}
            onValueChange={(value) => {
              setConnectSourceId(value);
              if (value === connectTargetId) {
                const nextTarget =
                  tabAgentOptions.find((agent) => agent.id !== value)?.id ?? "";
                setConnectTargetId(nextTarget);
              }
            }}
          >
            <SelectTrigger
              aria-label="Source agent"
              className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] focus-visible:border-white/24 focus-visible:ring-white/8 data-[placeholder]:text-white/28"
            >
              <SelectValue placeholder="Choose source agent" />
            </SelectTrigger>
            <SelectContent className="rounded-[1rem] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,19,0.98),rgba(11,11,12,0.96))] text-white backdrop-blur-2xl">
              {tabAgentOptions.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceDialogField>
        <WorkspaceDialogField label="Target" hint="Receives messages">
          <Select value={connectTargetId} onValueChange={setConnectTargetId}>
            <SelectTrigger
              aria-label="Target agent"
              className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] focus-visible:border-white/24 focus-visible:ring-white/8 data-[placeholder]:text-white/28"
            >
              <SelectValue placeholder="Choose target agent" />
            </SelectTrigger>
            <SelectContent className="rounded-[1rem] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,19,0.98),rgba(11,11,12,0.96))] text-white backdrop-blur-2xl">
              {tabAgentOptions
                .filter((agent) => agent.id !== connectSourceId)
                .map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </WorkspaceDialogField>
      </WorkspaceCommandDialog>

      <WorkspaceCommandDialog
        open={activeDialog === "send-task"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        icon={Sparkles}
        eyebrow="Dispatch"
        title="Send Task"
        description="Write the first concrete instruction for the selected agent. This goes straight into that node's queue."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setActiveDialog(null)}
              disabled={pendingAction === "send-task"}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleDispatchTask()}
              disabled={
                !taskMessageDraft.trim() || pendingAction === "send-task"
              }
            >
              {pendingAction === "send-task" ? "Sending..." : "Send Message"}
            </Button>
          </>
        }
      >
        <WorkspaceDialogMeta>
          {selectedAgentLabel ? (
            <>
              Delivering to{" "}
              <span className="font-semibold text-white">
                {selectedAgentLabel}
              </span>
            </>
          ) : (
            "No selected agent"
          )}
        </WorkspaceDialogMeta>
        <WorkspaceDialogField label="Message" hint="Plain task content">
          <Textarea
            autoFocus
            aria-label="Task message"
            value={taskMessageDraft}
            onChange={(event) => setTaskMessageDraft(event.target.value)}
            placeholder="Inspect the current directory and report back the file list."
            className="min-h-[140px] rounded-[1rem] border-white/10 bg-black/14 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
      </WorkspaceCommandDialog>

      <AlertDialog
        open={Boolean(deleteTabTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTabTarget(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-[30rem] rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,21,0.98),rgba(13,13,14,0.96))] shadow-[0_30px_90px_-42px_rgba(0,0,0,0.95),0_16px_38px_-28px_rgba(255,255,255,0.08)] backdrop-blur-2xl">
          <AlertDialogHeader className="gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.05] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_16px_30px_-22px_rgba(255,255,255,0.12)]">
                <Trash2 className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/38">
                  Destructive Action
                </p>
                <AlertDialogTitle className="mt-1 text-white">
                  Delete tab?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="text-white/62">
              {deleteTabTarget ? (
                <>
                  Remove{" "}
                  <span className="font-semibold text-white">
                    {deleteTabTarget.title}
                  </span>{" "}
                  and clean up its persisted graph.
                  {typeof deleteTabTarget.nodeCount === "number"
                    ? ` ${deleteTabTarget.nodeCount} node${deleteTabTarget.nodeCount === 1 ? "" : "s"} will be removed with it.`
                    : ""}
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => void handleDeleteTab()}
                disabled={pendingAction === "delete-tab"}
              >
                {pendingAction === "delete-tab" ? "Deleting..." : "Delete Tab"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex shrink-0 items-center gap-1.5 rounded-[11px] border border-transparent bg-transparent px-3 py-1.75 text-[11px] font-medium text-white/68 transition-[background-color,border-color,color] duration-150 hover:border-white/8 hover:bg-white/[0.04] hover:text-white/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:border-transparent disabled:text-white/28 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div aria-hidden="true" className="h-4 w-px shrink-0 bg-white/8" />;
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
        "pointer-events-auto relative isolate flex items-center gap-1.5 rounded-full border border-white/8 bg-[rgba(12,12,13,0.7)] px-2.5 py-1 text-[11px] font-medium text-white/74 backdrop-blur-sm",
        tone === "primary"
          ? "border-white/14 bg-white/[0.05] text-white/88"
          : "",
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
  const [interrupting, setInterrupting] = useState(false);
  const { agents } = useAgentNodesRuntime();
  const { tabs } = useAgentTabsRuntime();
  const { detail, error, loading } = useAgentDetail(
    agent.id,
    agent.node_type === "assistant",
  );
  const detailState = detail?.state ?? agent.state;
  const detailContacts = detail?.contacts ?? [];
  const detailConnections = detail?.connections ?? agent.connections;
  const detailTodos = detail?.todos ?? agent.todos;
  const detailHistory = detail?.history ?? [];
  const detailRoleName = detail?.role_name ?? agent.role_name;
  const detailTools = detail?.tools ?? [];
  const detailWriteDirs = detail?.write_dirs ?? [];
  const detailAllowNetwork = detail?.allow_network ?? false;
  const detailTabId = detail?.tab_id ?? agent.tab_id ?? null;
  const detailTab = detailTabId ? (tabs.get(detailTabId) ?? null) : null;
  const stateTimeline = detailHistory.filter(
    (entry): entry is HistoryEntry & { type: "StateEntry" } =>
      entry.type === "StateEntry",
  );
  const visibleHistory = detailHistory.filter(
    (entry) => entry.type !== "StateEntry",
  );
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
  const contactItems = detailContacts.map((contactId) => {
    const contactAgent = agents.get(contactId);
    return {
      id: contactId,
      label: contactAgent
        ? getNodeLabel({
            name: contactAgent.name,
            roleName: contactAgent.role_name,
            nodeType: contactAgent.node_type,
          })
        : contactId.slice(0, 8),
    };
  });

  return (
    <>
      <div className="flex items-center justify-between border-b border-white/6 px-3.5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/8">
            {agent.node_type === "assistant" ? (
              <Shield className="size-3.5 text-primary" />
            ) : (
              <Bot className="size-3.5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold">{label}</p>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-muted-foreground/78">
              {agent.id.slice(0, 8)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {detailState === "running" ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={interrupting}
              onClick={() => {
                setInterrupting(true);
                interruptNode(agent.id)
                  .catch(() => {
                    toast.error("Failed to interrupt node");
                  })
                  .finally(() => {
                    setInterrupting(false);
                  });
              }}
            >
              {interrupting ? "Interrupting..." : "Interrupt"}
            </Button>
          ) : null}
          <PanelActionButton title="Close details" onClick={onClose}>
            <X className="size-4" />
          </PanelActionButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5">
        <div className="space-y-3.5">
          <div className="grid gap-3.5 border-b border-white/6 pb-3.5 sm:grid-cols-3">
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

            <div className="min-w-0 sm:border-l sm:border-white/6 sm:pl-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contacts
              </p>
              <p className="mt-2 text-sm text-foreground">
                {detailContacts.length} reachable nodes
              </p>
            </div>

            <div className="min-w-0 sm:border-l sm:border-white/6 sm:pl-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Task Tab
              </p>
              <p className="mt-2 text-sm text-foreground">
                {detailTab?.title ?? detailTabId?.slice(0, 8) ?? "None"}
              </p>
            </div>
          </div>

          <DetailSection title="Task Context">
            {detailTabId ? (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    ID
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-foreground">
                    {detailTabId ?? "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Title
                  </p>
                  <p className="mt-1 text-foreground">
                    {detailTab?.title ?? "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Role
                  </p>
                  <p className="mt-1 text-foreground">
                    {detailRoleName ?? "None"}
                  </p>
                </div>
                {detailTab?.goal ? (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Goal
                    </p>
                    <p className="mt-1 text-foreground">{detailTab.goal}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No task metadata</p>
            )}
          </DetailSection>

          <DetailSection title="State Timeline">
            {stateTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No state changes yet
              </p>
            ) : (
              <div className="space-y-2">
                {stateTimeline
                  .slice(-6)
                  .reverse()
                  .map((entry) => (
                    <div
                      key={`${entry.timestamp}-${entry.state ?? "unknown"}`}
                      className="flex items-start justify-between gap-3 rounded-md border border-white/8 bg-white/[0.02] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <Badge
                          variant="outline"
                          className={
                            stateBadgeColor[entry.state ?? detailState]
                          }
                        >
                          {(entry.state ?? detailState).toUpperCase()}
                        </Badge>
                        {entry.reason ? (
                          <p className="mt-1 text-xs text-muted-foreground/78">
                            {entry.reason}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/64">
                        {formatDetailTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Contacts">
            {contactItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No direct contacts
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {contactItems.map((contact) => (
                  <span
                    key={contact.id}
                    className="rounded-md bg-white/[0.04] px-2 py-1 text-xs text-foreground"
                  >
                    {contact.label}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Graph Connections">
            {connectionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No graph edges</p>
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
                    <span className="size-2 rounded-full bg-white/40" />
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
            ) : visibleHistory.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No history yet.
              </div>
            ) : (
              <HistoryView
                history={visibleHistory}
                agentLabel={label}
                nodes={agents}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AssistantChatPanel({
  interrupting,
  onInterrupt,
  onOpenDetails,
}: {
  interrupting: boolean;
  onInterrupt: () => void;
  onOpenDetails: () => void;
}) {
  const { agents } = useAgentNodesRuntime();
  const { height: composerHeight, ref: composerRef } =
    useMeasuredHeight<HTMLDivElement>();
  const {
    assistantActivity,
    clearChat,
    clearing,
    connected,
    handleKeyDown,
    input,
    onMessagesScroll,
    scrollRef,
    sending,
    sendMessage,
    setInput,
    timelineItems,
  } = useAssistantChat({ bottomInset: composerHeight });
  const assistantRoleName = getAssistantNode(agents)?.role_name ?? null;

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/6 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold">Assistant</p>
          {assistantRoleName ? (
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/78">
              {assistantRoleName}
            </span>
          ) : null}
          <span className="text-[11px] text-muted-foreground/72">
            {connected ? "Online" : "Connecting..."}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={clearing}
            onClick={() => void clearChat()}
          >
            {clearing ? "Clearing..." : "Clear Chat"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={clearing}
            onClick={onOpenDetails}
          >
            Assistant Details
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <AssistantChatMessages
          bottomInset={composerHeight}
          items={timelineItems}
          nodes={agents}
          onScroll={onMessagesScroll}
          runningHint={assistantActivity.runningHint}
          scrollRef={scrollRef}
          variant="workspace"
        />

        <div
          ref={composerRef}
          style={{
            paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-[linear-gradient(180deg,transparent_0%,rgba(8,8,9,0.12)_18%,rgba(8,8,9,0.72)_60%,rgba(8,8,9,0.94)_100%)] px-2.5 pt-8"
        >
          <AssistantChatComposer
            busy={assistantActivity.running}
            disabled={!input.trim() || sending}
            input={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => void sendMessage()}
            onStop={onInterrupt}
            overlay
            stopping={interrupting}
            variant="workspace"
          />
        </div>
      </div>
    </div>
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
        "pointer-events-auto relative isolate flex size-9 items-center justify-center rounded-md border border-white/8 bg-black/[0.16] text-muted-foreground backdrop-blur-lg transition-[background-color,color] duration-150 hover:bg-white/[0.05] hover:text-foreground [contain:paint]",
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
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.045] hover:text-foreground"
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
    <section className="border-t border-white/6 pt-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function formatDetailTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return "—";
  }
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
