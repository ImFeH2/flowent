import type { AgentGraphHandle } from "@/components/AgentGraph";
import type { WorkspaceAgentOption } from "@/components/workspace/WorkspaceDialogs";
import {
  useAgentActivityRuntime,
  useAgentConnectionRuntime,
  useAgentHistoryRuntime,
  useAgentNodesRuntime,
  useAgentTabsRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import {
  createTabRequest,
  deleteTabRequest,
  fetchBlueprints,
  fetchRoles,
  saveTabAsBlueprintRequest,
} from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";
import { getWorkflowLeaderNode } from "@/lib/workflow";
import {
  hasCachedPanelWidth,
  usePanelDrag,
  usePanelWidth,
} from "@/hooks/usePanelDrag";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTabGraphHistory } from "@/hooks/useTabGraphHistory";
import type { AgentBlueprint, Role } from "@/types";
import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const WORKSPACE_PANEL_ID = "workspace-panel-width";
const MIN_PANEL_WIDTH = 296;
const MIN_FORMATION_WIDTH = 300;
const MAX_PANEL_WIDTH = 960;
const DEFAULT_PANEL_RATIO = 0.34;
const DEFAULT_PANEL_WIDTH = 448;
const COMPACT_PANEL_MIN_WIDTH = 300;

export type WorkspaceDialogKind =
  | "create-tab"
  | "create-agent"
  | "connect-agents"
  | "save-blueprint"
  | "delete-tab"
  | null;

export type WorkspacePanelView = "chat" | "detail";

export interface DeleteTabTarget {
  id: string;
  title: string;
  nodeCount?: number;
}

export function useHomePageState() {
  const { agents } = useAgentNodesRuntime();
  const { tabs } = useAgentTabsRuntime();
  const { connected } = useAgentConnectionRuntime();
  const { activeToolCalls } = useAgentActivityRuntime();
  const { streamingDeltas } = useAgentHistoryRuntime();
  const { activeTabId, selectedAgentId, selectAgent, setActiveTabId } =
    useAgentUI();

  const [panelOpen, setPanelOpen] = useState(true);
  const [panelView, setPanelView] = useState<WorkspacePanelView>("chat");
  const isCompactWorkspace = useMediaQuery("(max-width: 1180px)");
  const [activeDialog, setActiveDialog] = useState<WorkspaceDialogKind>(null);
  const [pendingAction, setPendingAction] = useState<WorkspaceDialogKind>(null);
  const [createTabTitle, setCreateTabTitle] = useState("");
  const [createTabGoal, setCreateTabGoal] = useState("");
  const [createTabAllowNetwork, setCreateTabAllowNetwork] = useState(false);
  const [createTabWriteDirs, setCreateTabWriteDirs] = useState("");
  const [createTabBlueprintId, setCreateTabBlueprintId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [createAgentRoleName, setCreateAgentRoleName] = useState("Worker");
  const [createAgentName, setCreateAgentName] = useState("");
  const [saveBlueprintName, setSaveBlueprintName] = useState("");
  const [saveBlueprintDescription, setSaveBlueprintDescription] = useState("");
  const [connectSourceId, setConnectSourceId] = useState("");
  const [connectTargetId, setConnectTargetId] = useState("");
  const [deleteTabTarget, setDeleteTabTarget] =
    useState<DeleteTabTarget | null>(null);
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
        if (!cancelled) {
          setRoles(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load roles");
        }
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

  const selectedAgent = selectedAgentId
    ? (agents.get(selectedAgentId) ?? null)
    : null;
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
  const availableCreateAgentRoles = roles;
  const availableCreateTabBlueprints = blueprints;

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
  const leaderNode = useMemo(
    () => getWorkflowLeaderNode(agents, activeTab),
    [activeTab, agents],
  );
  const leaderId = leaderNode?.id ?? activeTab?.leader_id ?? null;
  const leaderDetailVisible = panelView === "detail" && leaderNode !== null;
  const leaderPanelRunning = useMemo(() => {
    const leaderDeltas = leaderId ? (streamingDeltas.get(leaderId) ?? []) : [];

    return (
      connected &&
      Boolean(
        leaderId &&
        (leaderNode?.state === "running" ||
          leaderNode?.state === "sleeping" ||
          activeToolCalls.has(leaderId) ||
          leaderDeltas.length > 0),
      )
    );
  }, [activeToolCalls, connected, leaderId, leaderNode, streamingDeltas]);

  useEffect(() => {
    if (
      selectedAgent &&
      selectedAgent.tab_id !== null &&
      selectedAgent.tab_id !== activeTabId
    ) {
      selectAgent(null);
    }
  }, [activeTabId, selectAgent, selectedAgent]);

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

  const handleOpenLeaderDetails = useCallback(() => {
    setPanelOpen(true);
    setPanelView("detail");
  }, []);

  const handleCloseLeaderDetails = useCallback(() => {
    setPanelView("chat");
  }, []);

  const togglePanel = useCallback(() => {
    if (panelVisible) {
      if (selectedAgentId) {
        selectAgent(null);
      }
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
  }, [panelVisible, selectAgent, selectedAgentId]);

  const openCreateTabDialog = useCallback(() => {
    setCreateTabTitle("");
    setCreateTabGoal("");
    setCreateTabAllowNetwork(false);
    setCreateTabWriteDirs("");
    setCreateTabBlueprintId("");
    setActiveDialog("create-tab");
  }, []);

  const handleCreateTab = useCallback(async () => {
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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create tab",
      );
    } finally {
      setPendingAction(null);
    }
  }, [
    createTabAllowNetwork,
    createTabBlueprintId,
    createTabGoal,
    createTabTitle,
    createTabWriteDirs,
    setActiveTabId,
  ]);

  const openSaveBlueprintDialog = useCallback(() => {
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
  }, [activeTab, activeTabId, regularTabAgents.length]);

  const handleSaveCurrentNetworkAsBlueprint = useCallback(async () => {
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
  }, [
    activeTabId,
    refreshBlueprints,
    saveBlueprintDescription,
    saveBlueprintName,
  ]);

  const openCreateAgentDialog = useCallback(() => {
    if (!activeTabId) {
      toast.error("Create or select a tab first");
      return;
    }
    setCreateAgentRoleName("Worker");
    setCreateAgentName("");
    setActiveDialog("create-agent");
  }, [activeTabId]);

  const handleCreateAgent = useCallback(async () => {
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
      setCreateAgentName("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create agent",
      );
    } finally {
      setPendingAction(null);
    }
  }, [
    activeTabId,
    createAgentName,
    graphHistory,
    selectedCreateAgentRole?.name,
  ]);

  const requestDeleteTab = useCallback(
    (tabId: string, title: string, nodeCount?: number) => {
      setDeleteTabTarget({ id: tabId, title, nodeCount });
    },
    [],
  );

  const handleDeleteTab = useCallback(async () => {
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
  }, [deleteTabTarget]);

  const openConnectDialog = useCallback(() => {
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
  }, [activeTabId, selectedAgent, tabAgentOptions]);

  const handleConnectAgents = useCallback(async () => {
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
  }, [activeTabId, connectSourceId, connectTargetId, graphHistory]);

  return {
    activeDialog,
    activeTab,
    activeTabId,
    connected,
    connectSourceId,
    connectTargetId,
    createAgentName,
    createAgentRoleName,
    createTabAllowNetwork,
    createTabBlueprintId,
    createTabGoal,
    createTabTitle,
    createTabWriteDirs,
    deleteTabTarget,
    availableCreateAgentRoles,
    availableCreateTabBlueprints,
    graphConnectMode,
    graphHistory,
    graphRef,
    handleCloseLeaderDetails,
    handleConnectAgents,
    handleCreateAgent,
    handleCreateTab,
    handleDeleteTab,
    handleOpenLeaderDetails,
    handleSaveCurrentNetworkAsBlueprint,
    isCompactWorkspace,
    isDragging,
    leaderDetailVisible,
    leaderNode,
    leaderPanelRunning,
    loadingBlueprints,
    loadingRoles,
    openConnectDialog,
    openCreateAgentDialog,
    openCreateTabDialog,
    openSaveBlueprintDialog,
    panelVisible,
    pendingAction,
    regularTabAgents,
    requestDeleteTab,
    resolvedPanelWidth,
    roles,
    saveBlueprintDescription,
    saveBlueprintName,
    selectAgent,
    selectedAgent,
    selectedCreateAgentRole,
    selectedCreateTabBlueprint,
    setActiveDialog,
    setActiveTabId,
    setConnectSourceId,
    setConnectTargetId,
    setCreateAgentName,
    setCreateAgentRoleName,
    setCreateTabAllowNetwork,
    setCreateTabBlueprintId,
    setCreateTabGoal,
    setCreateTabTitle,
    setCreateTabWriteDirs,
    setDeleteTabTarget,
    setGraphConnectMode,
    setSaveBlueprintDescription,
    setSaveBlueprintName,
    startDrag,
    tabAgentOptions,
    tabs,
    togglePanel,
    workspaceRef,
  };
}
