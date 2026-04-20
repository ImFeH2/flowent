import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link2, Plus, Radio, Redo2, Save, Undo2, X } from "lucide-react";
import { AgentGraph, type AgentGraphHandle } from "@/components/AgentGraph";
import type { AgentBlueprint, Role } from "@/types";
import {
  useAgentActivityRuntime,
  useAgentConnectionRuntime,
  useAgentHistoryRuntime,
  useAgentNodesRuntime,
  useAgentTabsRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTabGraphHistory } from "@/hooks/useTabGraphHistory";
import { getNodeLabel } from "@/lib/constants";
import {
  hasCachedPanelWidth,
  usePanelDrag,
  usePanelWidth,
} from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { getAssistantNode } from "@/lib/assistant";
import {
  fetchRoles,
  fetchBlueprints,
  createTabRequest,
  deleteTabRequest,
  interruptNode,
  saveTabAsBlueprintRequest,
} from "@/lib/api";
import { toast } from "sonner";
import {
  ConnectAgentsDialog,
  CreateAgentDialog,
  CreateTabDialog,
  DeleteTabDialog,
  type WorkspaceAgentOption,
  SaveBlueprintDialog,
} from "@/components/workspace/WorkspaceDialogs";
import {
  AgentDetailPanel,
  AssistantChatPanel,
  BadgeChip,
  PanelToggleButton,
  ToolbarButton,
  ToolbarDivider,
} from "@/components/workspace/WorkspacePanels";

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
  | "save-blueprint"
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
  const [createTabAllowNetwork, setCreateTabAllowNetwork] = useState(false);
  const [createTabWriteDirs, setCreateTabWriteDirs] = useState("");
  const [createTabBlueprintId, setCreateTabBlueprintId] = useState("");
  const [createTabBlueprintQuery, setCreateTabBlueprintQuery] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [createAgentRoleName, setCreateAgentRoleName] = useState("Worker");
  const [createAgentRoleQuery, setCreateAgentRoleQuery] = useState("");
  const [createAgentName, setCreateAgentName] = useState("");
  const [saveBlueprintName, setSaveBlueprintName] = useState("");
  const [saveBlueprintDescription, setSaveBlueprintDescription] = useState("");
  const [connectSourceId, setConnectSourceId] = useState("");
  const [connectTargetId, setConnectTargetId] = useState("");
  const [deleteTabTarget, setDeleteTabTarget] = useState<{
    id: string;
    title: string;
    nodeCount?: number;
  } | null>(null);
  const previousCompactWorkspaceRef = useRef<boolean | null>(null);
  const graphRef = useRef<AgentGraphHandle | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const graphHistory = useTabGraphHistory();
  const [graphConnectMode, setGraphConnectMode] = useState(false);
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
    const previousCompactWorkspace = previousCompactWorkspaceRef.current;
    previousCompactWorkspaceRef.current = isCompactWorkspace;
    if (previousCompactWorkspace === null) {
      return;
    }
    if (!previousCompactWorkspace && isCompactWorkspace) {
      setPanelOpen(false);
    }
  }, [isCompactWorkspace]);

  const refreshBlueprints = useCallback(async () => {
    setLoadingBlueprints(true);
    try {
      const items = await fetchBlueprints();
      setBlueprints(items);
    } catch {
      toast.error("Failed to load blueprints");
    } finally {
      setLoadingBlueprints(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoles(true);
    fetchRoles()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setRoles(items);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        toast.error("Failed to load roles");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRoles(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshBlueprints();
  }, [refreshBlueprints]);

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) : null;
  const activeTab = activeTabId ? (tabs.get(activeTabId) ?? null) : null;
  const selectedCreateTabBlueprint = useMemo(
    () =>
      blueprints.find((blueprint) => blueprint.id === createTabBlueprintId) ??
      null,
    [blueprints, createTabBlueprintId],
  );
  const tabAgents = useMemo(
    () =>
      Array.from(agents.values()).filter(
        (agent) =>
          agent.node_type !== "assistant" && agent.tab_id === activeTabId,
      ),
    [activeTabId, agents],
  );
  const regularTabAgents = useMemo(
    () => tabAgents.filter((agent) => !agent.is_leader),
    [tabAgents],
  );
  const tabAgentOptions = useMemo<WorkspaceAgentOption[]>(
    () =>
      regularTabAgents.map((agent) => ({
        id: agent.id,
        label: getNodeLabel({
          name: agent.name,
          roleName: agent.role_name,
          nodeType: agent.node_type,
          isLeader: agent.is_leader,
        }),
      })),
    [regularTabAgents],
  );
  const selectedCreateAgentRole = useMemo(
    () => roles.find((role) => role.name === createAgentRoleName) ?? null,
    [createAgentRoleName, roles],
  );
  const filteredCreateAgentRoles = useMemo(() => {
    const query = createAgentRoleQuery.trim().toLowerCase();
    if (!query) {
      return roles;
    }
    return roles.filter((role) =>
      `${role.name} ${role.description}`.toLowerCase().includes(query),
    );
  }, [createAgentRoleQuery, roles]);
  const filteredCreateTabBlueprints = useMemo(() => {
    const query = createTabBlueprintQuery.trim().toLowerCase();
    if (!query) {
      return blueprints;
    }
    return blueprints.filter((blueprint) =>
      `${blueprint.name} ${blueprint.description}`
        .toLowerCase()
        .includes(query),
    );
  }, [blueprints, createTabBlueprintQuery]);

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
        assistantNode?.state === "sleeping" ||
        (assistantId ? activeToolCalls.has(assistantId) : false) ||
        assistantDeltas.length > 0)
    );
  }, [
    activeToolCalls,
    assistantId,
    assistantNode,
    connected,
    pendingAssistantMessages.length,
    streamingDeltas,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModPressed = event.metaKey || event.ctrlKey;
      if (!isModPressed || event.key.toLowerCase() !== "z") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable ||
        activeDialog !== null
      ) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        void graphHistory.redo(activeTabId).catch(() => undefined);
        return;
      }
      void graphHistory.undo(activeTabId).catch(() => undefined);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, activeTabId, graphHistory]);

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

  const renderPrimaryPanel = () => {
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
    setCreateTabAllowNetwork(false);
    setCreateTabWriteDirs("");
    setCreateTabBlueprintId("");
    setCreateTabBlueprintQuery("");
    setActiveDialog("create-tab");
  };

  const handleCreateTab = async () => {
    const title = createTabTitle.trim();
    if (!title) {
      return;
    }
    setPendingAction("create-tab");
    try {
      const writeDirsArray = createTabWriteDirs
        .split("\n")
        .map((dir) => dir.trim())
        .filter(Boolean);
      const tab = await createTabRequest(
        title,
        createTabGoal.trim(),
        createTabAllowNetwork,
        writeDirsArray,
        createTabBlueprintId || undefined,
      );
      setActiveTabId(tab.id);
      setActiveDialog(null);
      setCreateTabTitle("");
      setCreateTabGoal("");
      setCreateTabAllowNetwork(false);
      setCreateTabWriteDirs("");
      setCreateTabBlueprintId("");
      setCreateTabBlueprintQuery("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create tab",
      );
    } finally {
      setPendingAction(null);
    }
  };

  function openSaveBlueprintDialog() {
    if (!activeTabId || !activeTab) {
      toast.error("Create or select a tab first");
      return;
    }
    if (regularTabAgents.length === 0) {
      toast.error("Add at least one task node before saving a blueprint");
      return;
    }
    setSaveBlueprintName(activeTab.title);
    setSaveBlueprintDescription("");
    setActiveDialog("save-blueprint");
  }

  const handleSaveCurrentNetworkAsBlueprint = async () => {
    if (!activeTabId) {
      return;
    }
    const name = saveBlueprintName.trim();
    if (!name) {
      return;
    }
    setPendingAction("save-blueprint");
    try {
      await saveTabAsBlueprintRequest(
        activeTabId,
        name,
        saveBlueprintDescription.trim(),
      );
      await refreshBlueprints();
      setActiveDialog(null);
      setSaveBlueprintName("");
      setSaveBlueprintDescription("");
      toast.success("Blueprint saved to library");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save blueprint",
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
    setCreateAgentRoleQuery("");
    setCreateAgentName("");
    setActiveDialog("create-agent");
  };

  const handleCreateAgent = async () => {
    const roleName = selectedCreateAgentRole?.name ?? "";
    if (!activeTabId || !roleName) {
      return;
    }
    setPendingAction("create-agent");
    try {
      await graphHistory.createStandaloneAgent({
        tabId: activeTabId,
        roleName,
        name: createAgentName.trim() || undefined,
      });
      setActiveDialog(null);
      setCreateAgentRoleName("Worker");
      setCreateAgentRoleQuery("");
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
      await graphHistory.createConnection(
        activeTabId,
        connectSourceId,
        connectTargetId,
      );
      setActiveDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to connect agents",
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      ref={workspaceRef}
      className="relative isolate flex h-full overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-md [contain:paint]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--shell-surface-sweep)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--shell-hairline)" }}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative z-30 border-b border-border bg-background/45 backdrop-blur-md">
          <div className="pointer-events-auto relative z-10 flex items-center gap-1.5 overflow-x-auto px-3 py-2.5 pr-14 scrollbar-none">
            {Array.from(tabs.values()).map((tab) => (
              <div
                key={tab.id}
                className="group relative min-w-[120px] max-w-[200px] shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  onAuxClick={(event) => {
                    if (event.button !== 1) {
                      return;
                    }
                    event.preventDefault();
                    requestDeleteTab(tab.id, tab.title, tab.node_count);
                  }}
                  className={cn(
                    "relative flex h-8 w-full items-center rounded-md border-b-2 px-3 pr-8 text-left text-[13px] font-medium transition-[color,border-color,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    activeTabId === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-accent/25 hover:text-foreground",
                  )}
                >
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
                    "absolute right-1.5 top-1/2 z-20 -translate-y-1/2 rounded-sm p-1 transition-all duration-200 hover:bg-accent/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    activeTabId === tab.id
                      ? "text-foreground/70 opacity-100"
                      : "text-muted-foreground/60 opacity-0 group-hover:opacity-100",
                  )}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              aria-label="Create tab"
              onClick={() => {
                openCreateTabDialog();
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at 14% 10%, var(--shell-spotlight-primary), transparent 24%), linear-gradient(180deg, color-mix(in srgb, var(--foreground) 1%, transparent), transparent 22%)",
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background/28 to-transparent" />

        <div className="relative flex-1">
          <AgentGraph
            ref={graphRef}
            loadingRoles={loadingRoles}
            onConnectModeChange={setGraphConnectMode}
            onCreateConnection={graphHistory.createConnection}
            onCreateLinkedAgent={graphHistory.createLinkedAgent}
            onCreateStandaloneAgent={graphHistory.createStandaloneAgent}
            onDeleteAgent={graphHistory.deleteAgent}
            onDeleteConnection={graphHistory.deleteConnection}
            onInsertAgentBetween={graphHistory.insertAgentBetween}
            onOpenConnectDialog={openConnectDialog}
            roles={roles}
          />
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

          <div className="pointer-events-none absolute inset-x-3 bottom-4 z-40 flex justify-center">
            <div
              data-testid="workspace-toolbar"
              className="pointer-events-auto inline-flex max-w-full items-center overflow-x-auto rounded-xl border border-border bg-surface-overlay/92 p-0.5 shadow-sm scrollbar-none"
            >
              <ToolbarButton
                disabled={!activeTabId || !graphHistory.canUndo(activeTabId)}
                onClick={() => {
                  void graphHistory.undo(activeTabId);
                }}
              >
                <Undo2 className="size-4 opacity-70" />
                Undo
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                disabled={!activeTabId || !graphHistory.canRedo(activeTabId)}
                onClick={() => {
                  void graphHistory.redo(activeTabId);
                }}
              >
                <Redo2 className="size-4 opacity-70" />
                Redo
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                disabled={!activeTabId || regularTabAgents.length === 0}
                onClick={openSaveBlueprintDialog}
              >
                <Save className="size-4 opacity-70" />
                Save as Blueprint
              </ToolbarButton>
              <ToolbarDivider />
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
                active={graphConnectMode}
                onClick={() => graphRef.current?.enterConnectMode()}
              >
                <Link2 className="size-4 opacity-70" />
                Connect
              </ToolbarButton>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-30 sm:bottom-5 sm:right-5">
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
                className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px]"
                onClick={togglePanel}
              />,
              <motion.aside
                key="workspace-panel-sheet"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-y-2.5 right-2.5 z-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-md"
                style={{ width: `${resolvedPanelWidth}px` }}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-0 z-20 border transition-[opacity,border-color,box-shadow] duration-300",
                    !selectedAgent && assistantPanelRunning
                      ? "animate-pulse border-ring/25 opacity-100 shadow-lg shadow-ring/10"
                      : "border-transparent opacity-0",
                  )}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "var(--shell-surface-sweep)" }}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{ background: "var(--shell-hairline)" }}
                />
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
                      {renderPrimaryPanel()}
                    </motion.div>

                    <AnimatePresence>
                      {selectedAgent ? (
                        <motion.div
                          key={selectedAgent.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute inset-0 flex h-full flex-col bg-background/42"
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
              className="relative z-20 shrink-0 border-l border-border bg-surface-overlay shadow-md"
            >
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 z-20 border transition-[opacity,border-color,box-shadow] duration-300",
                  !selectedAgent && assistantPanelRunning
                    ? "animate-pulse border-ring/25 opacity-100 shadow-lg shadow-ring/10"
                    : "border-transparent opacity-0",
                )}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "var(--shell-surface-sweep)" }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "var(--shell-hairline)" }}
              />
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
                    {renderPrimaryPanel()}
                  </motion.div>

                  <AnimatePresence>
                    {selectedAgent ? (
                      <motion.div
                        key={selectedAgent.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 flex h-full flex-col bg-background/42"
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

      <CreateTabDialog
        open={activeDialog === "create-tab"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "create-tab"}
        title={createTabTitle}
        onTitleChange={setCreateTabTitle}
        goal={createTabGoal}
        onGoalChange={setCreateTabGoal}
        blueprintQuery={createTabBlueprintQuery}
        onBlueprintQueryChange={setCreateTabBlueprintQuery}
        blueprintId={createTabBlueprintId}
        onBlueprintIdChange={setCreateTabBlueprintId}
        selectedBlueprint={selectedCreateTabBlueprint}
        filteredBlueprints={filteredCreateTabBlueprints}
        loadingBlueprints={loadingBlueprints}
        allowNetwork={createTabAllowNetwork}
        onAllowNetworkChange={setCreateTabAllowNetwork}
        writeDirs={createTabWriteDirs}
        onWriteDirsChange={setCreateTabWriteDirs}
        onSubmit={() => void handleCreateTab()}
      />

      <SaveBlueprintDialog
        open={activeDialog === "save-blueprint"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "save-blueprint"}
        name={saveBlueprintName}
        onNameChange={setSaveBlueprintName}
        description={saveBlueprintDescription}
        onDescriptionChange={setSaveBlueprintDescription}
        onSubmit={() => void handleSaveCurrentNetworkAsBlueprint()}
      />

      <CreateAgentDialog
        open={activeDialog === "create-agent"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "create-agent"}
        activeTabTitle={activeTab?.title ?? null}
        roleQuery={createAgentRoleQuery}
        onRoleQueryChange={setCreateAgentRoleQuery}
        selectedRole={selectedCreateAgentRole}
        selectedRoleName={createAgentRoleName}
        onRoleNameChange={setCreateAgentRoleName}
        filteredRoles={filteredCreateAgentRoles}
        loadingRoles={loadingRoles}
        agentName={createAgentName}
        onAgentNameChange={setCreateAgentName}
        onSubmit={() => void handleCreateAgent()}
        submitDisabled={
          !activeTabId ||
          !selectedCreateAgentRole ||
          pendingAction === "create-agent"
        }
      />

      <ConnectAgentsDialog
        open={activeDialog === "connect-agents"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "connect-agents"}
        activeTabTitle={activeTab?.title ?? null}
        agentOptions={tabAgentOptions}
        sourceId={connectSourceId}
        targetId={connectTargetId}
        onSourceChange={(value) => {
          setConnectSourceId(value);
          if (value === connectTargetId) {
            const nextTarget =
              tabAgentOptions.find((agent) => agent.id !== value)?.id ?? "";
            setConnectTargetId(nextTarget);
          }
        }}
        onTargetChange={setConnectTargetId}
        onSubmit={() => void handleConnectAgents()}
      />

      <DeleteTabDialog
        open={Boolean(deleteTabTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTabTarget(null);
          }
        }}
        pending={pendingAction === "delete-tab"}
        target={deleteTabTarget}
        onDelete={() => void handleDeleteTab()}
      />
    </div>
  );
}
