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
  Link2,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  Redo2,
  Save,
  Shield,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { AgentGraph, type AgentGraphHandle } from "@/components/AgentGraph";
import { HistoryView } from "@/components/HistoryView";
import type { AgentBlueprint, HistoryEntry, Node, Role } from "@/types";
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
import { useTabGraphHistory } from "@/hooks/useTabGraphHistory";
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
  fetchRoles,
  fetchBlueprints,
  createTabRequest,
  deleteTabRequest,
  interruptNode,
  saveTabAsBlueprintRequest,
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
    if (isCompactWorkspace) {
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
  const tabAgentOptions = useMemo(
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
      className="relative isolate flex h-full overflow-hidden rounded-[0.9rem] border border-white/6 bg-[linear-gradient(180deg,rgba(12,12,13,0.88),rgba(8,8,9,0.84))] shadow-[0_16px_42px_-34px_rgba(0,0,0,0.78)] [contain:paint]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.018),transparent_14%,transparent_84%,rgba(255,255,255,0.01))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative z-30 border-b border-white/[0.06] bg-black/40 backdrop-blur-md">
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
                    "relative flex h-9 w-full items-center rounded-[0.7rem] px-3 pr-8 text-left text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    activeTabId === tab.id
                      ? "bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02),inset_0_-1px_0_0_rgba(255,255,255,0.9)]"
                      : "bg-transparent text-white/50 hover:bg-white/[0.03] hover:text-white/80",
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
                    "absolute right-1.5 top-1/2 z-20 -translate-y-1/2 rounded-sm p-1 transition-all duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    activeTabId === tab.id
                      ? "text-white/50 opacity-100"
                      : "text-white/30 opacity-0 group-hover:opacity-100",
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
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/40 transition-all duration-200 hover:bg-white/[0.04] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.03),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.01),transparent_22%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-[linear-gradient(90deg,transparent,rgba(8,8,9,0.14))]" />

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

          <div className="pointer-events-auto absolute bottom-4 left-1/2 z-40 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center rounded-[14px] border border-white/10 bg-[rgba(12,12,13,0.76)] p-0.5 shadow-[0_12px_28px_-20px_rgba(0,0,0,0.72)] backdrop-blur-md">
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
        title="Create Task Tab"
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
        <WorkspaceDialogField label="Blueprint" hint="Optional">
          <div className="space-y-3">
            <Input
              aria-label="Search blueprints"
              value={createTabBlueprintQuery}
              onChange={(event) =>
                setCreateTabBlueprintQuery(event.target.value)
              }
              placeholder="Search blueprints"
              className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
            />
            {selectedCreateTabBlueprint ? (
              <div className="rounded-[1rem] border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-[13px] font-medium text-white">
                  {selectedCreateTabBlueprint.name}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-white/50">
                  {selectedCreateTabBlueprint.description || "No description"}
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-white/35">
                  {selectedCreateTabBlueprint.node_count} nodes ·{" "}
                  {selectedCreateTabBlueprint.edge_count} edges
                </p>
              </div>
            ) : null}
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-[1rem] border border-white/10 bg-black/14 p-2 scrollbar-none">
              <button
                type="button"
                onClick={() => setCreateTabBlueprintId("")}
                className={cn(
                  "w-full rounded-[0.9rem] border px-3 py-2.5 text-left transition-colors",
                  !createTabBlueprintId
                    ? "border-white/20 bg-white/[0.06]"
                    : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.03]",
                )}
              >
                <div className="text-[13px] font-medium text-white">
                  Start blank
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-white/50">
                  Create a tab with only its bound Leader. Permissions do not
                  inherit from a blueprint.
                </p>
              </button>
              {loadingBlueprints ? (
                <p className="px-2 py-3 text-[12px] text-white/40">
                  Loading blueprints...
                </p>
              ) : filteredCreateTabBlueprints.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-white/40">
                  No blueprints match your search.
                </p>
              ) : (
                filteredCreateTabBlueprints.map((blueprint) => (
                  <button
                    key={blueprint.id}
                    type="button"
                    onClick={() => setCreateTabBlueprintId(blueprint.id)}
                    className={cn(
                      "w-full rounded-[0.9rem] border px-3 py-2.5 text-left transition-colors",
                      createTabBlueprintId === blueprint.id
                        ? "border-white/20 bg-white/[0.06]"
                        : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.03]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-medium text-white">
                        {blueprint.name}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-white/35">
                        v{blueprint.version}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/50">
                      {blueprint.description || "No description"}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-white/35">
                      {blueprint.node_count} nodes · {blueprint.edge_count}{" "}
                      edges
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </WorkspaceDialogField>
        <WorkspaceDialogMeta>
          The selected Network Access and Write Dirs initialize the bound Leader
          for this tab. They do not inherit from a blueprint.
        </WorkspaceDialogMeta>
        <WorkspaceDialogField
          label="Network Access"
          hint="Allow the leader to connect to the internet"
        >
          <button
            type="button"
            role="switch"
            aria-checked={createTabAllowNetwork}
            onClick={() => setCreateTabAllowNetwork(!createTabAllowNetwork)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2",
              createTabAllowNetwork ? "bg-white" : "bg-white/20",
            )}
          >
            <span className="sr-only">Network Access</span>
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none inline-block size-4 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out",
                createTabAllowNetwork ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </WorkspaceDialogField>
        <WorkspaceDialogField
          label="Write Dirs"
          hint="One absolute path per line"
        >
          <Textarea
            value={createTabWriteDirs}
            aria-label="Write directories"
            onChange={(event) => setCreateTabWriteDirs(event.target.value)}
            placeholder="/workspace/output&#10;/workspace/cache"
            className="min-h-[80px] rounded-[1rem] border-white/10 bg-black/14 font-mono text-[13px] text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
      </WorkspaceCommandDialog>

      <WorkspaceCommandDialog
        open={activeDialog === "save-blueprint"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        title="Save as Blueprint"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setActiveDialog(null)}
              disabled={pendingAction === "save-blueprint"}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveCurrentNetworkAsBlueprint()}
              disabled={
                !saveBlueprintName.trim() || pendingAction === "save-blueprint"
              }
            >
              {pendingAction === "save-blueprint"
                ? "Saving..."
                : "Save as Blueprint"}
            </Button>
          </>
        }
      >
        <WorkspaceDialogMeta>
          This only saves the current Agent Network structure. History, runtime
          state, todos, and permissions are not copied into the Agent Blueprint.
        </WorkspaceDialogMeta>
        <WorkspaceDialogField label="Name" hint="Required">
          <Input
            autoFocus
            aria-label="Blueprint name"
            value={saveBlueprintName}
            onChange={(event) => setSaveBlueprintName(event.target.value)}
            placeholder="Review Pipeline"
            className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
          />
        </WorkspaceDialogField>
        <WorkspaceDialogField label="Description" hint="Optional">
          <Textarea
            aria-label="Blueprint description"
            value={saveBlueprintDescription}
            onChange={(event) =>
              setSaveBlueprintDescription(event.target.value)
            }
            placeholder="Describe the reusable collaboration architecture."
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
        title="Add Agent"
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
                !selectedCreateAgentRole ||
                pendingAction === "create-agent"
              }
            >
              {pendingAction === "create-agent" ? "Adding..." : "Add Agent"}
            </Button>
          </>
        }
      >
        <WorkspaceDialogMeta>
          Adding a regular node to{" "}
          <span className="font-semibold text-white">
            {activeTab?.title ?? "No active tab"}
          </span>
        </WorkspaceDialogMeta>
        <WorkspaceDialogField
          label="Role"
          hint="Required · Leader is managed by the tab"
        >
          <div className="space-y-3">
            <Input
              autoFocus
              aria-label="Search roles"
              value={createAgentRoleQuery}
              onChange={(event) => setCreateAgentRoleQuery(event.target.value)}
              placeholder="Search roles"
              className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
            />
            {selectedCreateAgentRole ? (
              <div className="rounded-[1rem] border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-[13px] font-medium text-white">
                  {selectedCreateAgentRole.name}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-white/50">
                  {selectedCreateAgentRole.description}
                </p>
              </div>
            ) : null}
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-[1rem] border border-white/10 bg-black/14 p-2 scrollbar-none">
              {loadingRoles ? (
                <p className="px-2 py-3 text-[12px] text-white/40">
                  Loading roles...
                </p>
              ) : filteredCreateAgentRoles.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-white/40">
                  No roles match your search.
                </p>
              ) : (
                filteredCreateAgentRoles.map((role) => (
                  <button
                    key={role.name}
                    type="button"
                    onClick={() => setCreateAgentRoleName(role.name)}
                    className={cn(
                      "w-full rounded-[0.9rem] border px-3 py-2.5 text-left transition-colors",
                      createAgentRoleName === role.name
                        ? "border-white/20 bg-white/[0.06]"
                        : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.03]",
                    )}
                  >
                    <div className="text-[13px] font-medium text-white">
                      {role.name}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/50">
                      {role.description}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
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
        title="Connect Agents"
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
                : "Create Connection"}
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
        <WorkspaceDialogField label="Agent A" hint="First endpoint">
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
              aria-label="Agent A"
              className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] focus-visible:border-white/24 focus-visible:ring-white/8 data-[placeholder]:text-white/28"
            >
              <SelectValue placeholder="Choose first agent" />
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
        <WorkspaceDialogField label="Agent B" hint="Second endpoint">
          <Select value={connectTargetId} onValueChange={setConnectTargetId}>
            <SelectTrigger
              aria-label="Agent B"
              className="h-11 rounded-[1rem] border-white/10 bg-black/14 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] focus-visible:border-white/24 focus-visible:ring-white/8 data-[placeholder]:text-white/28"
            >
              <SelectValue placeholder="Choose second agent" />
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
                  and clean up its persisted agent network.
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
  active = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-[11px] border border-transparent bg-transparent px-3 py-1.75 text-[11px] font-medium text-white/68 transition-[background-color,border-color,color] duration-150 hover:border-white/8 hover:bg-white/[0.04] hover:text-white/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:border-transparent disabled:text-white/28 disabled:hover:bg-transparent",
        active && "border-white/12 bg-white/[0.06] text-white",
      )}
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
  const detailIsLeader = detail?.is_leader ?? agent.is_leader;
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
    isLeader: agent.is_leader,
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
            isLeader: connectedAgent.is_leader,
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
            isLeader: contactAgent.is_leader,
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
            {detailIsLeader ? (
              <span className="rounded-full border border-amber-300/24 bg-amber-300/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100">
                Leader
              </span>
            ) : null}
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-muted-foreground/78">
              {agent.id.slice(0, 8)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {detailState === "running" || detailState === "sleeping" ? (
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
              <p className="mt-2 select-text text-sm text-foreground">
                {detailContacts.length} reachable nodes
              </p>
            </div>

            <div className="min-w-0 sm:border-l sm:border-white/6 sm:pl-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Task Tab
              </p>
              <p className="mt-2 select-text text-sm text-foreground">
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
                  <p className="mt-1 select-text font-mono text-[11px] text-foreground">
                    {detailTabId ?? "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Title
                  </p>
                  <p className="mt-1 select-text text-foreground">
                    {detailTab?.title ?? "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Role
                  </p>
                  <p className="mt-1 select-text text-foreground">
                    {detailRoleName ?? "None"}
                  </p>
                </div>
                {detailTab?.goal ? (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Goal
                    </p>
                    <p className="mt-1 select-text text-foreground">
                      {detailTab.goal}
                    </p>
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
                          <p className="mt-1 select-text text-xs text-muted-foreground/78">
                            {entry.reason}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 select-text font-mono text-[10px] text-muted-foreground/64">
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
                    className="select-text rounded-md bg-white/[0.04] px-2 py-1 text-xs text-foreground"
                  >
                    {contact.label}
                  </span>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Agent Graph">
            {connectionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No graph edges</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectionItems.map((connection) => (
                  <span
                    key={connection.id}
                    className="select-text rounded-md bg-white/[0.04] px-2 py-1 text-xs text-foreground"
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
                    className="select-text rounded-md bg-white/[0.04] px-2 py-1 text-xs font-mono text-foreground"
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
                <p className="mt-1 select-text text-sm text-foreground">
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
                        className="select-text rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-foreground"
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
    addImages = async () => {},
    assistantActivity,
    clearChat,
    clearing,
    connected,
    draftImages = [],
    handleKeyDown,
    hasUploadingImages = false,
    input,
    onMessagesScroll,
    removeImage = () => {},
    scrollRef,
    sending,
    sendMessage,
    setInput,
    supportsInputImage = false,
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
            disabled={
              (!input.trim() && draftImages.length === 0) ||
              hasUploadingImages ||
              sending
            }
            images={draftImages}
            imageInputEnabled={supportsInputImage}
            input={input}
            onAddImages={(files) => void addImages(files)}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onRemoveImage={removeImage}
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
