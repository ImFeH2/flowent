"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeTypes,
  type NodeChange,
} from "@xyflow/react";
import { motion } from "framer-motion";
import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  CopyIcon,
  GitBranchIcon,
  ListChecksIcon,
  LockIcon,
  MessageSquareIcon,
  PanelRightIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  Trash2Icon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./theme-toggle";
import {
  availableTools,
  canvasSnapGrid,
  connectionTypeLabels,
  connectionTypeParameterSupport,
  runStatusLabels,
  workflowRunStatusLabels,
  type CanvasMode,
  type ConnectionType,
  type FlowEdge,
  type FlowNode,
  type ModelConnection,
  type ModelPreset,
  type NodeRunDetails,
  type Role,
  type RuntimeConversationEntry,
  type RuntimeConversationRole,
  type RunStatus,
  type TriggerMode,
  type WorkflowNodeData,
  type WorkflowNodeKind,
  type WorkflowRun,
  type WorkflowRunStatus,
  type BlueprintAsset as WorkflowAsset,
  type BlueprintLastRunStatus as WorkflowLastRunStatus,
} from "./model";
import { WorkflowNode } from "./workflow-node";
import {
  isValidConnection,
  type FlowentWorkspaceStore,
  useFlowentWorkspaceStore,
} from "./workspace-store";

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
};

type AppView = "workflows" | "roles" | "settings";
type WorkflowMainMode = "editor" | "overview";
type LocalDataStatus = FlowentWorkspaceStore["localDataStatus"];

const nodeLibrary: Array<{
  kind: WorkflowNodeKind;
  title: string;
  subtitle: string;
  icon: typeof PlayIcon;
}> = [
  {
    kind: "trigger",
    title: "Trigger",
    subtitle: "Manual, schedule, or webhook start",
    icon: PlayIcon,
  },
  {
    kind: "agent",
    title: "Agent",
    subtitle: "LLM processing step with prompt and tools",
    icon: BotIcon,
  },
];

type SidebarNavigationItem = {
  view: AppView;
  label: string;
  icon: typeof GitBranchIcon;
};

const fixedNavigation: SidebarNavigationItem[] = [
  { view: "workflows", label: "Workflows", icon: GitBranchIcon },
  { view: "roles", label: "Roles", icon: BotIcon },
  { view: "settings", label: "Settings", icon: SettingsIcon },
];

type WorkflowStatusFilter = "all" | WorkflowLastRunStatus;

const workflowStatusPresentation: Record<
  WorkflowLastRunStatus,
  {
    label: string;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  "not-run": { label: "Not run", badgeVariant: "outline" },
  running: { label: "Running", badgeVariant: "secondary" },
  success: { label: "Completed", badgeVariant: "default" },
  error: { label: "Needs review", badgeVariant: "destructive" },
};

const workflowStatusFilters: Array<{
  value: WorkflowStatusFilter;
  label: string;
}> = [
  { value: "all", label: "Any status" },
  { value: "not-run", label: "Not run" },
  { value: "running", label: "Running" },
  { value: "success", label: "Completed" },
  { value: "error", label: "Needs review" },
];

const conversationRolePresentation: Record<
  RuntimeConversationRole,
  {
    label: string;
    icon: typeof ShieldIcon;
  }
> = {
  system: {
    label: "System",
    icon: ShieldIcon,
  },
  user: {
    label: "User",
    icon: UserIcon,
  },
  "tool-calls": {
    label: "Tool Calls",
    icon: WrenchIcon,
  },
  assistant: {
    label: "Assistant",
    icon: MessageSquareIcon,
  },
};

function emptyRole(modelPresetId = ""): Role {
  return {
    id: "",
    name: "",
    avatar: "",
    systemPrompt: "",
    modelPresetId,
  };
}

function emptyModelConnection(): ModelConnection {
  return {
    id: "",
    type: "openai",
    name: "",
    accessKey: "",
    endpointUrl: "",
  };
}

function emptyPreset(modelConnectionId = ""): ModelPreset {
  return {
    id: "",
    name: "",
    modelConnectionId,
    modelName: "",
    temperature: 0.7,
    outputLimit: 1200,
    testStatus: "idle",
  };
}

function getAvatarFallback(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.at(0))
    .join("")
    .toUpperCase();

  return initials || "AI";
}

function getPresetName(modelPresets: ModelPreset[], presetId: string) {
  return (
    modelPresets.find((preset) => preset.id === presetId)?.name ?? "No model"
  );
}

function hasAvailableModelPreset(
  modelPresets: ModelPreset[],
  presetId: string | undefined,
) {
  return Boolean(
    presetId && modelPresets.some((preset) => preset.id === presetId),
  );
}

function getRoleNodePosition(nodeCount: number): FlowNode["position"] {
  return {
    x: 220 + nodeCount * 90,
    y: 260,
  };
}

function isWorkflowNodeKind(value: string): value is WorkflowNodeKind {
  return value === "trigger" || value === "agent";
}

export function FlowentWorkspace() {
  return (
    <ReactFlowProvider>
      <FlowentWorkspaceShell />
    </ReactFlowProvider>
  );
}

function FlowentWorkspaceShell() {
  const runTimers = useRef<number[]>([]);
  const { fitView, screenToFlowPosition, setViewport } = useReactFlow();
  const [activeView, setActiveView] = useState<AppView>("workflows");
  const [workflowMainMode, setWorkflowMainMode] =
    useState<WorkflowMainMode>("editor");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [highlightedRun, setHighlightedRun] = useState<{
    workflowId: string;
    runId: string;
  } | null>(null);
  const {
    blueprints,
    activeBlueprintId,
    nodes,
    edges,
    canvasMode,
    modelPresets,
    roles,
    localDataStatus,
    localDataMessage,
    selectedNodeIds,
    selectedEdgeIds,
    loadLocalSettings,
    setSelection,
    applyNodeChanges,
    applyEdgeChanges,
    connectNodes,
    addWorkflowNode,
    addQuickNode,
    deleteSelection,
    deleteConnectedEdges,
    updateNodeData,
    upsertRole,
    deleteRole,
    addAgentFromRole,
    startWorkflowRun,
    advanceWorkflowRun,
    finishWorkflowRun,
    selectWorkflowRun,
    returnToBlueprintMode,
    createBlueprint,
    openBlueprint,
  } = useFlowentWorkspaceStore(
    useShallow((state) => ({
      blueprints: state.blueprints,
      activeBlueprintId: state.activeBlueprintId,
      nodes: state.nodes,
      edges: state.edges,
      canvasMode: state.canvasMode,
      modelPresets: state.modelPresets,
      roles: state.roles,
      localDataStatus: state.localDataStatus,
      localDataMessage: state.localDataMessage,
      selectedNodeIds: state.selectedNodeIds,
      selectedEdgeIds: state.selectedEdgeIds,
      loadLocalSettings: state.loadLocalSettings,
      setSelection: state.setSelection,
      applyNodeChanges: state.applyNodeChanges,
      applyEdgeChanges: state.applyEdgeChanges,
      connectNodes: state.connectNodes,
      addWorkflowNode: state.addWorkflowNode,
      addQuickNode: state.addQuickNode,
      deleteSelection: state.deleteSelection,
      deleteConnectedEdges: state.deleteConnectedEdges,
      updateNodeData: state.updateNodeData,
      upsertRole: state.upsertRole,
      deleteRole: state.deleteRole,
      addAgentFromRole: state.addAgentFromRole,
      startWorkflowRun: state.startWorkflowRun,
      advanceWorkflowRun: state.advanceWorkflowRun,
      finishWorkflowRun: state.finishWorkflowRun,
      selectWorkflowRun: state.selectWorkflowRun,
      returnToBlueprintMode: state.returnToBlueprintMode,
      createBlueprint: state.createBlueprint,
      openBlueprint: state.openBlueprint,
    })),
  );

  const activeWorkflow = useMemo(
    () =>
      blueprints.find((blueprint) => blueprint.id === activeBlueprintId) ??
      null,
    [activeBlueprintId, blueprints],
  );
  const workflowHistory = useMemo(
    () =>
      [...blueprints].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      ),
    [blueprints],
  );

  const nodesWithContext = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          canvasMode,
          modelPresets,
          onSelectNode: () => {
            window.setTimeout(() => setSelection([node.id], []), 0);
          },
        },
      })),
    [canvasMode, modelPresets, nodes, setSelection],
  );

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [nodes, selectedNodeIds],
  );

  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const runBlockReason = useMemo(
    () =>
      nodes.some(
        (node) =>
          node.data.kind === "agent" &&
          !hasAvailableModelPreset(modelPresets, node.data.modelPresetId),
      )
        ? "Choose models before running"
        : null,
    [modelPresets, nodes],
  );

  const clearRunTimers = useCallback(() => {
    runTimers.current.forEach((timer) => window.clearTimeout(timer));
    runTimers.current = [];
  }, []);

  useEffect(() => {
    void loadLocalSettings();
  }, [loadLocalSettings]);

  useEffect(() => clearRunTimers, [clearRunTimers]);

  const highlightedRunId =
    highlightedRun?.workflowId === activeBlueprintId
      ? highlightedRun.runId
      : null;

  useEffect(() => {
    if (!highlightedRun) {
      return;
    }

    const timer = window.setTimeout(() => {
      setHighlightedRun((run) =>
        run?.workflowId === highlightedRun.workflowId &&
        run.runId === highlightedRun.runId
          ? null
          : run,
      );
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [highlightedRun]);

  const runWorkflow = useCallback(() => {
    if (runBlockReason) {
      return;
    }

    const previousRunId = activeWorkflow?.runHistory[0]?.id ?? null;

    clearRunTimers();
    setActiveView("workflows");
    setWorkflowMainMode("editor");
    startWorkflowRun();

    const nextRunId =
      useFlowentWorkspaceStore
        .getState()
        .blueprints.find((blueprint) => blueprint.id === activeBlueprintId)
        ?.selectedRunId ?? null;

    if (activeBlueprintId && nextRunId && nextRunId !== previousRunId) {
      setHighlightedRun({ workflowId: activeBlueprintId, runId: nextRunId });
    }

    runTimers.current = [
      window.setTimeout(() => {
        advanceWorkflowRun();
      }, 800),
      window.setTimeout(() => {
        finishWorkflowRun();
      }, 1600),
    ];
  }, [
    advanceWorkflowRun,
    activeWorkflow?.runHistory,
    activeBlueprintId,
    clearRunTimers,
    finishWorkflowRun,
    runBlockReason,
    startWorkflowRun,
  ]);

  const returnToWorkflowEditor = useCallback(() => {
    clearRunTimers();
    returnToBlueprintMode();
  }, [clearRunTimers, returnToBlueprintMode]);

  const selectRunItem = useCallback(
    (runId: string) => {
      clearRunTimers();
      setActiveView("workflows");
      setWorkflowMainMode("editor");
      selectWorkflowRun(runId);
    },
    [clearRunTimers, selectWorkflowRun],
  );

  const openWorkflowView = useCallback(
    (blueprintId: string) => {
      clearRunTimers();
      openBlueprint(blueprintId);
      setActiveView("workflows");
      setWorkflowMainMode("editor");
    },
    [clearRunTimers, openBlueprint],
  );

  const createWorkflowView = useCallback(() => {
    clearRunTimers();
    createBlueprint();
    setActiveView("workflows");
    setWorkflowMainMode("editor");
  }, [clearRunTimers, createBlueprint]);

  const openWorkflowsOverview = useCallback(() => {
    clearRunTimers();
    setActiveView("workflows");
    setWorkflowMainMode("overview");
  }, [clearRunTimers]);

  const navigateTopLevelView = useCallback(
    (view: AppView) => {
      if (view === "workflows") {
        openWorkflowsOverview();
        return;
      }

      setActiveView(view);
    },
    [openWorkflowsOverview],
  );

  const onDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, kind: WorkflowNodeKind) => {
      if (canvasMode === "workflow") {
        event.preventDefault();
        return;
      }

      event.dataTransfer.setData("application/flowent-node", kind);
      event.dataTransfer.effectAllowed = "copy";
    },
    [canvasMode],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (canvasMode === "workflow") {
        return;
      }

      const kind = event.dataTransfer.getData("application/flowent-node");

      if (!isWorkflowNodeKind(kind)) {
        return;
      }

      addWorkflowNode(
        kind,
        screenToFlowPosition(
          { x: event.clientX, y: event.clientY },
          { snapToGrid: true, snapGrid: canvasSnapGrid },
        ),
      );
    },
    [addWorkflowNode, canvasMode, screenToFlowPosition],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();

      if (canvasMode === "workflow") {
        return;
      }

      addWorkflowNode(
        "agent",
        screenToFlowPosition(
          { x: event.clientX, y: event.clientY },
          { snapToGrid: true, snapGrid: canvasSnapGrid },
        ),
      );
    },
    [addWorkflowNode, canvasMode, screenToFlowPosition],
  );

  return (
    <TooltipProvider>
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-dvh overflow-hidden bg-background text-foreground"
      >
        <AppSidebar
          activeView={activeView}
          workflows={workflowHistory}
          activeWorkflowId={activeBlueprintId}
          workflowOverviewOpen={
            activeView === "workflows" && workflowMainMode === "overview"
          }
          collapsed={sidebarCollapsed}
          onNavigate={navigateTopLevelView}
          onOpenWorkflow={openWorkflowView}
          onCreateWorkflow={createWorkflowView}
          onOpenWorkflowsOverview={openWorkflowsOverview}
          onToggleCollapsed={() =>
            setSidebarCollapsed((collapsed) => !collapsed)
          }
        />
        <div className="min-w-0 flex-1">
          {activeView === "workflows" ? (
            workflowMainMode === "overview" ? (
              <WorkflowsOverview
                workflows={workflowHistory}
                activeWorkflowId={activeBlueprintId}
                onCreateWorkflow={createWorkflowView}
                onOpenWorkflow={openWorkflowView}
              />
            ) : activeWorkflow ? (
              <div className="grid h-full min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(12rem,36dvh)] lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-1">
                <CanvasWorkspace
                  workflowName={activeWorkflow.name}
                  workflowSummary={activeWorkflow.summary}
                  workflowLastRunStatus={activeWorkflow.lastRunStatus}
                  workflowUpdatedAt={activeWorkflow.updatedAt}
                  workflowNodeCount={activeWorkflow.nodes.length}
                  workflowRunCount={activeWorkflow.runHistory.length}
                  nodes={nodesWithContext}
                  edges={edges}
                  canvasMode={canvasMode}
                  selectedNodeIds={selectedNodeIds}
                  selectedEdgeIds={selectedEdgeIds}
                  onNodesChange={applyNodeChanges}
                  onEdgesChange={applyEdgeChanges}
                  onConnect={connectNodes}
                  onDrop={onDrop}
                  onDragStart={onDragStart}
                  onPaneContextMenu={onPaneContextMenu}
                  onNodesDelete={deleteConnectedEdges}
                  onSelectionChange={setSelection}
                  onQuickAdd={addQuickNode}
                  onReturnToWorkflowEditor={returnToWorkflowEditor}
                  onDeleteSelection={deleteSelection}
                  onFitView={() => fitView({ padding: 0.2, duration: 250 })}
                  onResetViewport={() =>
                    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 })
                  }
                />
                <aside
                  aria-label="Current workflow"
                  className="grid min-h-0 grid-rows-[minmax(11rem,0.52fr)_minmax(0,1fr)] border-t bg-card lg:border-t-0 lg:border-l"
                >
                  <RunsPanel
                    runs={activeWorkflow.runHistory}
                    activeRunId={
                      canvasMode === "workflow"
                        ? (activeWorkflow.selectedRunId ?? null)
                        : null
                    }
                    runBlockReason={runBlockReason}
                    highlightedRunId={highlightedRunId}
                    onRun={runWorkflow}
                    onSelectRun={selectRunItem}
                  />
                  <div className="min-h-0 border-t">
                    <PropertyPanel
                      selectedNode={selectedNode}
                      selectedCount={
                        selectedNodeIds.length + selectedEdgeIds.length
                      }
                      workflowSummary={activeWorkflow.summary}
                      workflowLastRunStatus={activeWorkflow.lastRunStatus}
                      workflowUpdatedAt={activeWorkflow.updatedAt}
                      workflowNodeCount={activeWorkflow.nodes.length}
                      workflowRunCount={activeWorkflow.runHistory.length}
                      canvasMode={canvasMode}
                      modelPresets={modelPresets}
                      updateNodeData={updateNodeData}
                    />
                  </div>
                </aside>
              </div>
            ) : (
              <WorkflowEmptyState onCreateWorkflow={createWorkflowView} />
            )
          ) : activeView === "roles" ? (
            <RolesLibrary
              roles={roles}
              modelPresets={modelPresets}
              nodeCount={nodes.length}
              upsertRole={upsertRole}
              deleteRole={deleteRole}
              addAgentFromRole={addAgentFromRole}
              onOpenWorkflow={() => {
                setActiveView("workflows");
                setWorkflowMainMode("editor");
              }}
            />
          ) : activeView === "settings" ? (
            <SettingsView
              localDataStatus={localDataStatus}
              localDataMessage={localDataMessage}
            />
          ) : null}
        </div>
      </motion.main>
    </TooltipProvider>
  );
}

function AppSidebar({
  activeView,
  workflows,
  activeWorkflowId,
  workflowOverviewOpen,
  collapsed,
  onNavigate,
  onOpenWorkflow,
  onCreateWorkflow,
  onOpenWorkflowsOverview,
  onToggleCollapsed,
}: {
  activeView: AppView;
  workflows: WorkflowAsset[];
  activeWorkflowId: string | null;
  workflowOverviewOpen: boolean;
  collapsed: boolean;
  onNavigate: (view: AppView) => void;
  onOpenWorkflow: (workflowId: string) => void;
  onCreateWorkflow: () => void;
  onOpenWorkflowsOverview: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <motion.aside
      aria-label="Workspace navigation"
      animate={{ width: collapsed ? 72 : 312 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="shrink-0 border-r bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <div
          className={cn(
            "flex items-center gap-3",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">Flowent</h1>
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </Button>
        </div>
        <Separator />
        <SidebarFixedEntries
          activeView={activeView}
          workflowOverviewOpen={workflowOverviewOpen}
          collapsed={collapsed}
          onCreateWorkflow={onCreateWorkflow}
          onNavigate={onNavigate}
          onOpenWorkflowsOverview={onOpenWorkflowsOverview}
        />
        <WorkflowHistoryList
          activeWorkflowId={activeWorkflowId}
          collapsed={collapsed}
          workflows={workflows}
          onExpandSidebar={onToggleCollapsed}
          onOpenWorkflow={onOpenWorkflow}
        />
        <div className="shrink-0 space-y-3">
          <Separator />
          <ThemeToggle collapsed={collapsed} />
        </div>
      </div>
    </motion.aside>
  );
}

function SidebarFixedEntries({
  activeView,
  workflowOverviewOpen,
  collapsed,
  onCreateWorkflow,
  onNavigate,
  onOpenWorkflowsOverview,
}: {
  activeView: AppView;
  workflowOverviewOpen: boolean;
  collapsed: boolean;
  onCreateWorkflow: () => void;
  onNavigate: (view: AppView) => void;
  onOpenWorkflowsOverview: () => void;
}) {
  const isItemActive = (item: SidebarNavigationItem) =>
    item.view === "workflows"
      ? activeView === "workflows" && workflowOverviewOpen
      : activeView === item.view;

  const selectItem = (item: SidebarNavigationItem) => {
    if (item.view === "workflows") {
      onOpenWorkflowsOverview();
      return;
    }

    onNavigate(item.view);
  };

  if (collapsed) {
    const createButton = (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Create workflow"
        onClick={onCreateWorkflow}
      >
        <PlusIcon />
      </Button>
    );
    const searchButton = (
      <Button
        variant={
          activeView === "workflows" && workflowOverviewOpen
            ? "secondary"
            : "ghost"
        }
        size="icon"
        aria-label="Search workflows"
        onClick={onOpenWorkflowsOverview}
      >
        <SearchIcon />
      </Button>
    );

    return (
      <section className="shrink-0">
        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger render={createButton} />
            <TooltipContent side="right">Create workflow</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={searchButton} />
            <TooltipContent side="right">Search workflows</TooltipContent>
          </Tooltip>
          {fixedNavigation.map((item) => (
            <SidebarNavButton
              key={item.view}
              item={item}
              collapsed={collapsed}
              active={isItemActive(item)}
              onSelect={() => selectItem(item)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="shrink-0 space-y-3">
      <Button className="w-full justify-start" onClick={onCreateWorkflow}>
        <PlusIcon />
        Create workflow
      </Button>
      <Button
        variant={
          activeView === "workflows" && workflowOverviewOpen
            ? "secondary"
            : "ghost"
        }
        className="w-full justify-start"
        onClick={onOpenWorkflowsOverview}
      >
        <SearchIcon />
        Search workflows
      </Button>
      <nav className="space-y-1">
        {fixedNavigation.map((item) => (
          <SidebarNavButton
            key={item.view}
            item={item}
            collapsed={collapsed}
            active={isItemActive(item)}
            onSelect={() => selectItem(item)}
          />
        ))}
      </nav>
    </section>
  );
}

function SidebarNavButton({
  item,
  collapsed,
  active,
  onSelect,
}: {
  item: SidebarNavigationItem;
  collapsed: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  const button = (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "w-full justify-start gap-3",
        collapsed && "justify-center px-0",
      )}
      aria-label={item.label}
      onClick={onSelect}
    >
      <Icon className="size-4" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Button>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function WorkflowHistoryList({
  workflows,
  activeWorkflowId,
  collapsed,
  onOpenWorkflow,
  onExpandSidebar,
}: {
  workflows: WorkflowAsset[];
  activeWorkflowId: string | null;
  collapsed: boolean;
  onOpenWorkflow: (workflowId: string) => void;
  onExpandSidebar: () => void;
}) {
  if (collapsed) {
    const button = (
      <Button
        variant={activeWorkflowId ? "secondary" : "ghost"}
        size="icon"
        aria-label="Workflows"
        onClick={onExpandSidebar}
      >
        <GitBranchIcon />
      </Button>
    );

    return (
      <section className="space-y-2">
        <Separator />
        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent side="right">Workflows</TooltipContent>
          </Tooltip>
          <Badge variant="outline" className="px-1.5">
            {workflows.length}
          </Badge>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-base font-medium">Workflow history</h2>
          <Badge variant="outline">{workflows.length}</Badge>
        </div>
      </div>
      {workflows.length === 0 ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-1 pb-1">
            <div className="rounded-lg border bg-background p-3">
              <div className="text-sm font-medium">No workflows yet</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Create your first workflow to start building.
              </p>
            </div>
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <motion.ol layout className="space-y-1 px-1 pb-1">
            {workflows.map((workflow) => (
              <WorkflowSidebarItem
                key={workflow.id}
                workflow={workflow}
                active={workflow.id === activeWorkflowId}
                onOpenWorkflow={onOpenWorkflow}
              />
            ))}
          </motion.ol>
        </ScrollArea>
      )}
    </section>
  );
}

function WorkflowSidebarItem({
  workflow,
  active,
  onOpenWorkflow,
}: {
  workflow: WorkflowAsset;
  active: boolean;
  onOpenWorkflow: (workflowId: string) => void;
}) {
  return (
    <motion.li layout>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        aria-label={`Open ${workflow.name}`}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active && "bg-muted text-foreground",
        )}
        onClick={() => onOpenWorkflow(workflow.id)}
      >
        <span className="min-w-0 truncate">{workflow.name}</span>
        {active && (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
        )}
      </button>
    </motion.li>
  );
}

function WorkflowsOverview({
  workflows,
  activeWorkflowId,
  onCreateWorkflow,
  onOpenWorkflow,
}: {
  workflows: WorkflowAsset[];
  activeWorkflowId: string | null;
  onCreateWorkflow: () => void;
  onOpenWorkflow: (workflowId: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredWorkflows = useMemo(
    () =>
      workflows.filter((workflow) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          workflow.name.toLowerCase().includes(normalizedSearch);
        const matchesStatus =
          statusFilter === "all" || workflow.lastRunStatus === statusFilter;

        return matchesSearch && matchesStatus;
      }),
    [normalizedSearch, statusFilter, workflows],
  );
  const hasFilters = normalizedSearch.length > 0 || statusFilter !== "all";
  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setStatusFilter("all");
  }, []);

  return (
    <section
      aria-label="Workflows overview"
      className="flex h-full min-w-0 flex-col gap-5 p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold">Workflows</h1>
        </div>
        <Button onClick={onCreateWorkflow}>
          <PlusIcon />
          Create workflow
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search workflows"
            className="h-9 pl-9"
            placeholder="Search workflows"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as WorkflowStatusFilter)
          }
        >
          <SelectTrigger aria-label="Filter workflows" className="h-9 w-full">
            <SelectValue>
              {(value: WorkflowStatusFilter | null) =>
                workflowStatusFilters.find((item) => item.value === value)
                  ?.label ?? "Any status"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {workflowStatusFilters.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {workflows.length === 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <div className="text-lg font-medium">No workflows yet</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Create your first workflow to start building.
          </p>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="rounded-lg border bg-card p-6">
          <div className="text-lg font-medium">No matching workflows</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Clear the current filters to return to the full workflow history.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <motion.div layout className="grid gap-3 pr-3 xl:grid-cols-2">
            {filteredWorkflows.map((workflow) => (
              <WorkflowOverviewCard
                key={workflow.id}
                workflow={workflow}
                active={workflow.id === activeWorkflowId}
                onOpenWorkflow={onOpenWorkflow}
              />
            ))}
          </motion.div>
        </ScrollArea>
      )}
      {hasFilters && filteredWorkflows.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}

function WorkflowOverviewCard({
  workflow,
  active,
  onOpenWorkflow,
}: {
  workflow: WorkflowAsset;
  active: boolean;
  onOpenWorkflow: (workflowId: string) => void;
}) {
  const status = workflowStatusPresentation[workflow.lastRunStatus];

  return (
    <motion.article layout>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        aria-label={`Open ${workflow.name}`}
        className={cn(
          "w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active && "border-primary bg-muted",
        )}
        onClick={() => onOpenWorkflow(workflow.id)}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-medium">{workflow.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {workflow.summary}
            </p>
          </div>
          {active && <Badge variant="secondary">Current</Badge>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={status.badgeVariant}>{status.label}</Badge>
          <span>{workflow.nodes.length} nodes</span>
          <span>{workflow.runHistory.length} runs</span>
          <span>Updated {formatWorkflowDate(workflow.updatedAt)}</span>
        </div>
      </button>
    </motion.article>
  );
}

function WorkflowEmptyState({
  onCreateWorkflow,
}: {
  onCreateWorkflow: () => void;
}) {
  return (
    <section className="flex h-full min-w-0 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold">
              Create your first workflow
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start with a blank workflow, then add triggers, agents, and steps
              in the editor.
            </p>
          </div>
          <Button onClick={onCreateWorkflow}>
            <PlusIcon />
            Create workflow
          </Button>
        </div>
      </div>
    </section>
  );
}

function formatWorkflowDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRunDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getWorkflowRunStatusVariant(
  status: WorkflowRunStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") {
    return "destructive";
  }

  if (status === "succeeded") {
    return "default";
  }

  return status === "canceled" ? "outline" : "secondary";
}

function RunsPanel({
  runs,
  activeRunId,
  runBlockReason,
  highlightedRunId,
  onSelectRun,
  onRun,
}: {
  runs: WorkflowRun[];
  activeRunId: string | null;
  runBlockReason: string | null;
  highlightedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onRun: () => void;
}) {
  return (
    <section
      aria-label="Runs"
      className="flex min-h-0 flex-col gap-3 overflow-hidden p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecksIcon className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-base font-medium">Runs</h2>
          <Badge variant="outline">{runs.length}</Badge>
        </div>
      </div>
      <div>
        <Button
          className="w-full"
          disabled={Boolean(runBlockReason)}
          onClick={onRun}
        >
          <PlayIcon />
          Run workflow
        </Button>
        {runBlockReason && (
          <Badge
            variant="destructive"
            className="mt-2 h-auto whitespace-normal"
          >
            {runBlockReason}
          </Badge>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock3Icon className="size-4 text-muted-foreground" />
            No runs yet
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Run this workflow to watch its first run here.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <motion.ol layout className="space-y-2 pr-2 pb-1">
            {runs.map((run) => (
              <RunItem
                key={run.id}
                run={run}
                active={run.id === activeRunId}
                highlighted={run.id === highlightedRunId}
                onSelectRun={onSelectRun}
              />
            ))}
          </motion.ol>
        </ScrollArea>
      )}
    </section>
  );
}

function RunItem({
  run,
  active,
  highlighted,
  onSelectRun,
}: {
  run: WorkflowRun;
  active: boolean;
  highlighted: boolean;
  onSelectRun: (runId: string) => void;
}) {
  const statusLabel = workflowRunStatusLabels[run.status];

  return (
    <motion.li
      layout
      initial={highlighted ? { opacity: 0, y: -8 } : false}
      animate={
        highlighted
          ? { opacity: 1, y: 0, scale: [1, 1.015, 1] }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={{ duration: highlighted ? 0.42 : 0.18, ease: "easeOut" }}
    >
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        aria-label={`${statusLabel} run from ${formatRunDate(run.startedAt)}`}
        className={cn(
          "w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active && "border-primary bg-muted",
          highlighted && "ring-2 ring-ring/60",
        )}
        onClick={() => onSelectRun(run.id)}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-sm font-medium">
              {formatRunDate(run.startedAt)}
            </div>
            <Badge
              variant={getWorkflowRunStatusVariant(run.status)}
              className="shrink-0"
            >
              {statusLabel}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {run.summary}
          </p>
        </div>
      </button>
    </motion.li>
  );
}

function RoleCard({
  role,
  modelPresets,
  nodeCount,
  isEditing,
  addAgentFromRole,
  deleteRole,
  setDraft,
  setEditingId,
  onOpenWorkflow,
}: {
  role: Role;
  modelPresets: ModelPreset[];
  nodeCount: number;
  isEditing: boolean;
  addAgentFromRole: (roleId: string, position: FlowNode["position"]) => void;
  deleteRole: (roleId: string) => void;
  setDraft: React.Dispatch<React.SetStateAction<Role>>;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenWorkflow: () => void;
}) {
  const hasValidPreset = modelPresets.some(
    (preset) => preset.id === role.modelPresetId,
  );

  return (
    <Card className="rounded-lg p-4">
      <CardHeader>
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background text-lg font-medium">
            {role.avatar || getAvatarFallback(role.name)}
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate text-xl">{role.name}</CardTitle>
          </div>
        </div>
        <CardAction className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasValidPreset}
            onClick={() => {
              addAgentFromRole(role.id, getRoleNodePosition(nodeCount));
              onOpenWorkflow();
            }}
          >
            Use Role
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingId(role.id);
              setDraft(role);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${role.name}`}
            onClick={() => {
              deleteRole(role.id);
              if (isEditing) {
                setEditingId(null);
                setDraft(emptyRole(modelPresets.at(0)?.id));
              }
            }}
          >
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {role.systemPrompt}
        </p>
        {!hasValidPreset && (
          <Badge
            variant="destructive"
            className="mt-3 h-auto whitespace-normal"
          >
            Choose an available model before using this role.
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function CanvasWorkspace({
  workflowName,
  workflowSummary,
  workflowLastRunStatus,
  workflowUpdatedAt,
  workflowNodeCount,
  workflowRunCount,
  nodes,
  edges,
  canvasMode,
  selectedNodeIds,
  selectedEdgeIds,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDrop,
  onDragStart,
  onPaneContextMenu,
  onNodesDelete,
  onSelectionChange,
  onQuickAdd,
  onReturnToWorkflowEditor,
  onDeleteSelection,
  onFitView,
  onResetViewport,
}: {
  workflowName: string;
  workflowSummary: string;
  workflowLastRunStatus: WorkflowLastRunStatus;
  workflowUpdatedAt: string;
  workflowNodeCount: number;
  workflowRunCount: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  canvasMode: CanvasMode;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    kind: WorkflowNodeKind,
  ) => void;
  onPaneContextMenu: (event: React.MouseEvent | MouseEvent) => void;
  onNodesDelete: (deletedNodes: FlowNode[]) => void;
  onSelectionChange: (nodeIds: string[], edgeIds: string[]) => void;
  onQuickAdd: (kind: WorkflowNodeKind) => void;
  onReturnToWorkflowEditor: () => void;
  onDeleteSelection: () => void;
  onFitView: () => void;
  onResetViewport: () => void;
}) {
  const isWorkflowMode = canvasMode === "workflow";
  const status = workflowStatusPresentation[workflowLastRunStatus];

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-background",
        isWorkflowMode && "bg-muted/30",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4",
          isWorkflowMode && "bg-muted/40",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-medium">{workflowName}</h2>
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {workflowSummary}
            </p>
          </div>
          <Badge variant={isWorkflowMode ? "default" : "secondary"}>
            {isWorkflowMode ? (
              <>
                <LockIcon className="size-3.5" />
                Run view
              </>
            ) : (
              <>
                <PencilIcon className="size-3.5" />
                Workflow editor
              </>
            )}
          </Badge>
          <Badge variant={status.badgeVariant}>{status.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {workflowNodeCount} nodes
          </span>
          <span className="text-sm text-muted-foreground">
            {workflowRunCount} runs
          </span>
          <span className="text-sm text-muted-foreground">
            Updated {formatWorkflowDate(workflowUpdatedAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NodeLibrary
            disabled={isWorkflowMode}
            onDragStart={onDragStart}
            onQuickAdd={onQuickAdd}
          />
          <Separator orientation="vertical" className="hidden h-7 sm:block" />
          {isWorkflowMode && (
            <Button variant="outline" onClick={onReturnToWorkflowEditor}>
              <RotateCcwIcon />
              Edit workflow
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onDeleteSelection}
            disabled={
              isWorkflowMode ||
              (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0)
            }
          >
            <Trash2Icon />
            Delete
          </Button>
          <Button variant="outline" onClick={onFitView}>
            <PanelRightIcon />
            Fit
          </Button>
          <Button variant="outline" onClick={onResetViewport}>
            100%
          </Button>
        </div>
      </div>
      {isWorkflowMode && <RunViewBanner />}
      <div
        className={cn(
          "min-h-0 flex-1",
          isWorkflowMode && "border-t border-border/60",
        )}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(event) => {
            if (!isWorkflowMode) {
              event.preventDefault();
            }
          }}
          onPaneContextMenu={onPaneContextMenu}
          onNodesDelete={onNodesDelete}
          onNodeClick={(_, node) => {
            window.setTimeout(() => onSelectionChange([node.id], []), 0);
          }}
          onEdgeClick={(_, edge) => {
            window.setTimeout(() => onSelectionChange([], [edge.id]), 0);
          }}
          onSelectionChange={({
            nodes: selectionNodes,
            edges: selectionEdges,
          }) => {
            onSelectionChange(
              selectionNodes.map((node) => node.id),
              selectionEdges.map((edge) => edge.id),
            );
          }}
          isValidConnection={isValidConnection}
          fitView
          nodesDraggable={!isWorkflowMode}
          nodesConnectable={!isWorkflowMode}
          edgesReconnectable={!isWorkflowMode}
          snapToGrid={!isWorkflowMode}
          snapGrid={canvasSnapGrid}
          multiSelectionKeyCode="Shift"
          deleteKeyCode={isWorkflowMode ? null : ["Backspace", "Delete"]}
          selectionOnDrag
        >
          <Background gap={canvasSnapGrid[0]} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) =>
              node.data.kind === "trigger" ? "var(--chart-3)" : "var(--muted)"
            }
            maskColor="var(--canvas-minimap-mask)"
          />
        </ReactFlow>
      </div>
    </section>
  );
}

function RunViewBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-6 py-2 text-sm"
    >
      <Badge variant="outline">
        <LockIcon className="size-3.5" />
        Read-only run
      </Badge>
      <span className="text-muted-foreground">
        Editing is locked while this run is open.
      </span>
    </motion.div>
  );
}

function NodeLibrary({
  disabled,
  onDragStart,
  onQuickAdd,
}: {
  disabled: boolean;
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    kind: WorkflowNodeKind,
  ) => void;
  onQuickAdd: (kind: WorkflowNodeKind) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {nodeLibrary.map((item) => {
        const Icon = item.icon;

        return (
          <div key={item.kind} className="flex items-center gap-1">
            <Button
              variant="outline"
              disabled={disabled}
              draggable={!disabled}
              title={item.subtitle}
              onDragStart={(event) => onDragStart(event, item.kind)}
            >
              <Icon className="size-4" />
              {item.title}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Add ${item.title}`}
              disabled={disabled}
              onClick={() => onQuickAdd(item.kind)}
            >
              <PlusIcon />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function PropertyPanel({
  selectedNode,
  selectedCount,
  workflowSummary,
  workflowLastRunStatus,
  workflowUpdatedAt,
  workflowNodeCount,
  workflowRunCount,
  canvasMode,
  modelPresets,
  updateNodeData,
}: {
  selectedNode: FlowNode | null;
  selectedCount: number;
  workflowSummary: string;
  workflowLastRunStatus: WorkflowLastRunStatus;
  workflowUpdatedAt: string;
  workflowNodeCount: number;
  workflowRunCount: number;
  canvasMode: CanvasMode;
  modelPresets: ModelPreset[];
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}) {
  const readOnly = canvasMode === "workflow";

  if (readOnly) {
    return (
      <ExecutionDetailsPanel
        selectedNode={selectedNode}
        selectedCount={selectedCount}
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium">Properties</h2>
        </div>
        <Separator />
        {selectedNode ? (
          selectedNode.data.kind === "trigger" ? (
            <TriggerProperties
              node={selectedNode}
              readOnly={readOnly}
              updateNodeData={updateNodeData}
            />
          ) : (
            <AgentProperties
              node={selectedNode}
              readOnly={readOnly}
              modelPresets={modelPresets}
              updateNodeData={updateNodeData}
            />
          )
        ) : (
          <WorkflowSummary
            selectedCount={selectedCount}
            workflowSummary={workflowSummary}
            workflowLastRunStatus={workflowLastRunStatus}
            workflowUpdatedAt={workflowUpdatedAt}
            workflowNodeCount={workflowNodeCount}
            workflowRunCount={workflowRunCount}
            modelPresets={modelPresets}
          />
        )}
      </div>
    </ScrollArea>
  );
}

function ExecutionDetailsPanel({
  selectedNode,
  selectedCount,
}: {
  selectedNode: FlowNode | null;
  selectedCount: number;
}) {
  const details = selectedNode?.data.runDetails;
  const status = selectedNode?.data.status ?? "idle";

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium">Execution Details</h2>
          <Badge variant="outline">
            <LockIcon className="size-3.5" />
            Read-only
          </Badge>
        </div>
        <Separator />
        {selectedNode &&
        details &&
        status !== "idle" &&
        status !== "pending" ? (
          <NodeExecutionDetails
            node={selectedNode}
            details={details}
            status={status}
          />
        ) : (
          <ExecutionEmptyState
            selectedCount={selectedCount}
            selectedStatus={selectedNode?.data.status}
          />
        )}
      </div>
    </ScrollArea>
  );
}

function NodeExecutionDetails({
  node,
  details,
  status,
}: {
  node: FlowNode;
  details: NodeRunDetails;
  status: Exclude<RunStatus, "idle" | "pending">;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-medium">
              {node.data.title}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {node.data.kind === "agent" ? "Agent step" : "Trigger step"}
            </div>
          </div>
          <RunStatusBadge status={status} />
        </div>
      </div>
      {details.kind === "agent" ? (
        <AgentExecutionDetails details={details} />
      ) : (
        <TriggerExecutionDetails details={details} />
      )}
    </div>
  );
}

function RunStatusBadge({
  status,
}: {
  status: Exclude<RunStatus, "idle" | "pending">;
}) {
  return (
    <Badge variant={status === "error" ? "destructive" : "secondary"}>
      {runStatusLabels[status]}
    </Badge>
  );
}

function AgentExecutionDetails({
  details,
}: {
  details: Extract<NodeRunDetails, { kind: "agent" }>;
}) {
  return (
    <div className="space-y-4">
      {(details.modelPresetName || details.modelName) && (
        <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
          {details.modelPresetName && (
            <ExecutionMetaItem
              label="Model Preset"
              value={details.modelPresetName}
            />
          )}
          {details.modelName && (
            <ExecutionMetaItem label="Model" value={details.modelName} />
          )}
        </div>
      )}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4 text-muted-foreground" />
          <h3 className="text-base font-medium">Conversation History</h3>
        </div>
        <ol className="space-y-0">
          {details.conversation.map((entry, index) => (
            <ConversationHistoryItem
              key={entry.id}
              entry={entry}
              step={index + 1}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

function TriggerExecutionDetails({
  details,
}: {
  details: Extract<NodeRunDetails, { kind: "trigger" }>;
}) {
  return (
    <div className="space-y-3">
      <ExecutionPayloadBlock label="Input" value={details.inputPayload} />
      <ExecutionPayloadBlock label="Output" value={details.outputPayload} />
    </div>
  );
}

function ConversationHistoryItem({
  entry,
  step,
}: {
  entry: RuntimeConversationEntry;
  step: number;
}) {
  const presentation = conversationRolePresentation[entry.role];
  const Icon = presentation.icon;

  return (
    <li className="relative border-l border-border pb-4 pl-5 last:pb-0">
      <span className="absolute -left-2 top-0 flex size-4 items-center justify-center rounded-full border bg-card">
        <Icon className="size-3" />
      </span>
      <div className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{presentation.label}</Badge>
          <span className="text-xs text-muted-foreground">Step {step}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
          {entry.content}
        </p>
      </div>
    </li>
  );
}

function ExecutionPayloadBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-background p-3">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
        {value}
      </p>
    </section>
  );
}

function ExecutionMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function ExecutionEmptyState({
  selectedCount,
  selectedStatus,
}: {
  selectedCount: number;
  selectedStatus?: RunStatus;
}) {
  const message =
    selectedStatus === "pending"
      ? "This node has not started yet."
      : selectedCount > 0
        ? "Select a running, completed, or failed node to inspect this run."
        : "Select a node to inspect this run.";

  return (
    <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function TriggerProperties({
  node,
  readOnly,
  updateNodeData,
}: {
  node: FlowNode;
  readOnly: boolean;
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}) {
  const mode = node.data.triggerMode ?? "manual";

  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor="trigger-name">
        <Input
          id="trigger-name"
          value={node.data.title}
          disabled={readOnly}
          onChange={(event) =>
            updateNodeData(node.id, { title: event.target.value })
          }
        />
      </Field>
      <Field label="Trigger Type" htmlFor="trigger-type">
        <Select
          value={mode}
          disabled={readOnly}
          onValueChange={(value) =>
            updateNodeData(node.id, { triggerMode: value as TriggerMode })
          }
        >
          <SelectTrigger id="trigger-type" className="w-full">
            <SelectValue>
              {(value: TriggerMode | null) =>
                value === "schedule"
                  ? "Cron / Schedule"
                  : value === "webhook"
                    ? "Webhook"
                    : "Manual"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="schedule">Cron / Schedule</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {mode === "manual" && (
        <Field label="Initial Payload" htmlFor="initial-payload">
          <Textarea
            id="initial-payload"
            value={node.data.initialPayload ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              updateNodeData(node.id, { initialPayload: event.target.value })
            }
          />
        </Field>
      )}
      {mode === "schedule" && (
        <Field label="Cron Expression" htmlFor="cron-expression">
          <Input
            id="cron-expression"
            value={node.data.cronExpression ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              updateNodeData(node.id, { cronExpression: event.target.value })
            }
          />
        </Field>
      )}
      {mode === "webhook" && (
        <Field label="Webhook URL" htmlFor="webhook-url">
          <div className="flex gap-2">
            <Input
              id="webhook-url"
              disabled={readOnly}
              readOnly
              value={node.data.webhookUrl ?? ""}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy webhook URL"
              disabled={readOnly}
              onClick={() =>
                navigator.clipboard?.writeText(node.data.webhookUrl ?? "")
              }
            >
              <CopyIcon />
            </Button>
          </div>
        </Field>
      )}
    </div>
  );
}

function AgentProperties({
  node,
  readOnly,
  modelPresets,
  updateNodeData,
}: {
  node: FlowNode;
  readOnly: boolean;
  modelPresets: ModelPreset[];
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}) {
  const hasSelectedPreset = hasAvailableModelPreset(
    modelPresets,
    node.data.modelPresetId,
  );
  const selectedPreset = hasSelectedPreset
    ? (node.data.modelPresetId ?? "")
    : "";
  const tools = node.data.tools ?? [];

  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor="agent-name">
        <Input
          id="agent-name"
          value={node.data.title}
          disabled={readOnly}
          onChange={(event) =>
            updateNodeData(node.id, {
              title: event.target.value,
              name: event.target.value,
            })
          }
        />
      </Field>
      <Field label="Model Preset" htmlFor="model-preset">
        {!hasSelectedPreset && (
          <Badge
            variant="destructive"
            className="mb-2 h-auto whitespace-normal"
          >
            Choose an available model before running this agent.
          </Badge>
        )}
        <Select
          value={selectedPreset}
          disabled={readOnly || modelPresets.length === 0}
          onValueChange={(value) => {
            if (typeof value === "string") {
              updateNodeData(node.id, { modelPresetId: value });
            }
          }}
        >
          <SelectTrigger id="model-preset" className="w-full">
            <SelectValue placeholder="Select model preset">
              {(value: string | null) =>
                modelPresets.find((preset) => preset.id === value)?.name ??
                "Select model preset"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {modelPresets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name} · {preset.modelName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="System Prompt" htmlFor="system-prompt">
        <Textarea
          id="system-prompt"
          className="min-h-36"
          value={node.data.systemPrompt ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            updateNodeData(node.id, { systemPrompt: event.target.value })
          }
        />
      </Field>
      <div className="space-y-2">
        <Label>Tools</Label>
        {availableTools.map((tool) => (
          <label
            key={tool.id}
            className="flex items-center gap-2 rounded-lg border bg-background p-2 text-sm"
          >
            <Checkbox
              checked={tools.includes(tool.id)}
              disabled={readOnly}
              onCheckedChange={(checked) => {
                updateNodeData(node.id, {
                  tools: checked
                    ? Array.from(new Set(tools.concat(tool.id)))
                    : tools.filter((item) => item !== tool.id),
                });
              }}
            />
            {tool.label}
          </label>
        ))}
      </div>
      {readOnly && node.data.status === "error" && node.data.errorMessage && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {node.data.errorMessage}
        </div>
      )}
    </div>
  );
}

function WorkflowSummary({
  selectedCount,
  workflowSummary,
  workflowLastRunStatus,
  workflowUpdatedAt,
  workflowNodeCount,
  workflowRunCount,
  modelPresets,
}: {
  selectedCount: number;
  workflowSummary: string;
  workflowLastRunStatus: WorkflowLastRunStatus;
  workflowUpdatedAt: string;
  workflowNodeCount: number;
  workflowRunCount: number;
  modelPresets: ModelPreset[];
}) {
  const status = workflowStatusPresentation[workflowLastRunStatus];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="text-lg font-medium">Workflow details</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {workflowSummary}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={status.badgeVariant}>{status.label}</Badge>
          <Badge variant="outline">{workflowNodeCount} nodes</Badge>
          <Badge variant="outline">{workflowRunCount} runs</Badge>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Updated {formatWorkflowDate(workflowUpdatedAt)}
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-lg font-medium">Selection</div>
        <div className="mt-2 text-2xl font-semibold">
          {selectedCount > 0 ? `${selectedCount} items` : "No active item"}
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-lg font-medium">Model Presets</div>
        <div className="mt-2 text-2xl font-semibold">
          {modelPresets.length} available
        </div>
      </Card>
    </div>
  );
}

function RolesLibrary({
  roles,
  modelPresets,
  nodeCount,
  upsertRole,
  deleteRole,
  addAgentFromRole,
  onOpenWorkflow,
}: {
  roles: Role[];
  modelPresets: ModelPreset[];
  nodeCount: number;
  upsertRole: (role: Role, editingId: string | null) => void;
  deleteRole: (roleId: string) => void;
  addAgentFromRole: (roleId: string, position: FlowNode["position"]) => void;
  onOpenWorkflow: () => void;
}) {
  const [draft, setDraft] = useState<Role>(() =>
    emptyRole(modelPresets.at(0)?.id),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const firstUsableRole = roles.find((role) =>
    hasAvailableModelPreset(modelPresets, role.modelPresetId),
  );
  const draftHasAvailablePreset = hasAvailableModelPreset(
    modelPresets,
    draft.modelPresetId,
  );
  const draftPresetValue = draftHasAvailablePreset ? draft.modelPresetId : "";

  const saveRole = useCallback(() => {
    if (
      !draft.name.trim() ||
      !draft.systemPrompt.trim() ||
      !draftHasAvailablePreset
    ) {
      return;
    }

    upsertRole(
      {
        ...draft,
        avatar: draft.avatar.trim() || getAvatarFallback(draft.name),
      },
      editingId,
    );
    setDraft(emptyRole(modelPresets.at(0)?.id));
    setEditingId(null);
  }, [draft, draftHasAvailablePreset, editingId, modelPresets, upsertRole]);

  return (
    <ScrollArea className="h-full">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Roles</h1>
          </div>
          <Button
            onClick={() => {
              addAgentFromRole(
                firstUsableRole?.id ?? "",
                getRoleNodePosition(nodeCount),
              );
              onOpenWorkflow();
            }}
            disabled={!firstUsableRole}
          >
            <BotIcon />
            Use First Role
          </Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="grid gap-3 md:grid-cols-2">
            {roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                modelPresets={modelPresets}
                nodeCount={nodeCount}
                isEditing={editingId === role.id}
                addAgentFromRole={addAgentFromRole}
                deleteRole={deleteRole}
                setDraft={setDraft}
                setEditingId={setEditingId}
                onOpenWorkflow={onOpenWorkflow}
              />
            ))}
          </div>
          <Card className="rounded-lg p-4">
            <CardHeader>
              <CardTitle>{editingId ? "Edit Role" : "Add Role"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Role Name" htmlFor="role-name">
                <Input
                  id="role-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Avatar" htmlFor="role-avatar">
                <Input
                  id="role-avatar"
                  value={draft.avatar}
                  maxLength={4}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      avatar: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </Field>
              <Field label="Default Model Preset" htmlFor="role-model">
                {!draftHasAvailablePreset && (
                  <Badge
                    variant="destructive"
                    className="mb-2 h-auto whitespace-normal"
                  >
                    Choose an available model before using this role.
                  </Badge>
                )}
                <Select
                  value={draftPresetValue}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        modelPresetId: value,
                      }));
                    }
                  }}
                  disabled={modelPresets.length === 0}
                >
                  <SelectTrigger id="role-model" className="w-full">
                    <SelectValue placeholder="Select model preset">
                      {(value: string | null) =>
                        value
                          ? getPresetName(modelPresets, value)
                          : "Select model preset"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {modelPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name} · {preset.modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="System Prompt" htmlFor="role-system-prompt">
                <Textarea
                  id="role-system-prompt"
                  className="min-h-40"
                  value={draft.systemPrompt}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      systemPrompt: event.target.value,
                    }))
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveRole}>
                  <PlusIcon />
                  {editingId ? "Save Role" : "Add Role"}
                </Button>
                {editingId && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDraft(emptyRole(modelPresets.at(0)?.id));
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </ScrollArea>
  );
}

function SettingsView({
  localDataStatus,
  localDataMessage,
}: {
  localDataStatus: LocalDataStatus;
  localDataMessage: string | null;
}) {
  const {
    modelConnections,
    modelPresets,
    upsertModelConnection,
    deleteModelConnection,
    upsertModelPreset,
    deleteModelPreset,
    testModelPreset,
  } = useFlowentWorkspaceStore(
    useShallow((state) => ({
      modelConnections: state.modelConnections,
      modelPresets: state.modelPresets,
      upsertModelConnection: state.upsertModelConnection,
      deleteModelConnection: state.deleteModelConnection,
      upsertModelPreset: state.upsertModelPreset,
      deleteModelPreset: state.deleteModelPreset,
      testModelPreset: state.testModelPreset,
    })),
  );

  return (
    <section className="flex h-full min-w-0 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Settings</h1>
        {(localDataMessage || localDataStatus === "loading") && (
          <Badge
            variant={localDataStatus === "error" ? "destructive" : "secondary"}
            className="h-auto whitespace-normal"
          >
            {localDataMessage ??
              (localDataStatus === "loading"
                ? "Loading saved settings..."
                : null)}
          </Badge>
        )}
      </div>
      <Tabs defaultValue="connections" className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="presets">Model Presets</TabsTrigger>
        </TabsList>
        <TabsContent value="connections" className="min-h-0">
          <ConnectionSettings
            modelConnections={modelConnections}
            modelPresets={modelPresets}
            upsertModelConnection={upsertModelConnection}
            deleteModelConnection={deleteModelConnection}
          />
        </TabsContent>
        <TabsContent value="presets" className="min-h-0">
          <PresetSettings
            modelConnections={modelConnections}
            modelPresets={modelPresets}
            upsertModelPreset={upsertModelPreset}
            deleteModelPreset={deleteModelPreset}
            testModelPreset={testModelPreset}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function getConnectionStatus(connection: ModelConnection) {
  return connection.endpointUrl.trim() && connection.accessKey
    ? "Ready"
    : "Needs details";
}

function getPresetConnection(
  modelConnections: ModelConnection[],
  preset: ModelPreset,
) {
  return modelConnections.find(
    (connection) => connection.id === preset.modelConnectionId,
  );
}

function normalizePresetForConnectionType(
  preset: ModelPreset,
  connectionType: ConnectionType,
): ModelPreset {
  const supportedParameters = connectionTypeParameterSupport[connectionType];

  return {
    ...preset,
    topP: supportedParameters.topP ? preset.topP : undefined,
    frequencyPenalty: supportedParameters.frequencyPenalty
      ? preset.frequencyPenalty
      : undefined,
  };
}

function ConnectionSettings({
  modelConnections,
  modelPresets,
  upsertModelConnection,
  deleteModelConnection,
}: {
  modelConnections: ModelConnection[];
  modelPresets: ModelPreset[];
  upsertModelConnection: (
    modelConnection: ModelConnection,
    editingId: string | null,
  ) => Promise<boolean>;
  deleteModelConnection: (modelConnectionId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ModelConnection>(emptyModelConnection);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editingConnection = editingId
    ? modelConnections.find((connection) => connection.id === editingId)
    : null;
  const showTypeChangePrompt = Boolean(
    editingConnection && editingConnection.type !== draft.type,
  );

  const saveConnection = useCallback(() => {
    if (
      !draft.name.trim() ||
      !draft.endpointUrl.trim() ||
      (!editingId && !draft.accessKey.trim())
    ) {
      return;
    }

    setIsSaving(true);
    void upsertModelConnection(draft, editingId).then((saved) => {
      setIsSaving(false);

      if (!saved) {
        return;
      }

      setDraft(emptyModelConnection());
      setEditingId(null);
    });
  }, [draft, editingId, upsertModelConnection]);

  const confirmAndDeleteConnection = useCallback(
    (connection: ModelConnection) => {
      const dependentPresetCount = modelPresets.filter(
        (preset) => preset.modelConnectionId === connection.id,
      ).length;
      const confirmed =
        dependentPresetCount === 0 ||
        window.confirm(
          `${connection.name} is used by ${dependentPresetCount} model preset${
            dependentPresetCount === 1 ? "" : "s"
          }. Delete it and remove those presets?`,
        );

      if (!confirmed) {
        return;
      }

      setIsSaving(true);
      void deleteModelConnection(connection.id).then((saved) => {
        setIsSaving(false);

        if (saved && editingId === connection.id) {
          setDraft(emptyModelConnection());
          setEditingId(null);
        }
      });
    },
    [deleteModelConnection, editingId, modelPresets],
  );

  return (
    <ScrollArea className="h-[calc(100dvh-10rem)]">
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          {modelConnections.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No model connections yet.
              </CardContent>
            </Card>
          ) : (
            modelConnections.map((connection) => {
              const connectionStatus = getConnectionStatus(connection);

              return (
                <Card key={connection.id}>
                  <CardHeader>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate text-xl">
                        {connection.name}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {connectionTypeLabels[connection.type]}
                        </Badge>
                        <Badge
                          variant={
                            connectionStatus === "Ready"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {connectionStatus}
                        </Badge>
                      </div>
                    </div>
                    <CardAction className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(connection.id);
                          setDraft({ ...connection, accessKey: "" });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${connection.name}`}
                        disabled={isSaving}
                        onClick={() => confirmAndDeleteConnection(connection)}
                      >
                        <Trash2Icon />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Endpoint URL:
                    </span>{" "}
                    <span className="break-all">{connection.endpointUrl}</span>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Connection" : "Add Connection"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Connection type" htmlFor="connection-type">
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    type: value as ConnectionType,
                  }))
                }
              >
                <SelectTrigger id="connection-type" className="w-full">
                  <SelectValue>
                    {(value: ConnectionType | null) =>
                      value ? connectionTypeLabels[value] : "OpenAI"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(connectionTypeLabels).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            {showTypeChangePrompt && (
              <Badge variant="secondary" className="h-auto whitespace-normal">
                Existing model presets may need review after this change.
              </Badge>
            )}
            <Field label="Name" htmlFor="connection-name">
              <Input
                id="connection-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Endpoint URL" htmlFor="connection-endpoint-url">
              <Input
                id="connection-endpoint-url"
                value={draft.endpointUrl}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    endpointUrl: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Access key" htmlFor="connection-access-key">
              <Input
                id="connection-access-key"
                type="password"
                value={draft.accessKey}
                placeholder={editingId ? "Leave blank to keep saved key" : ""}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    accessKey: event.target.value,
                  }))
                }
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isSaving} onClick={saveConnection}>
                <PlusIcon />
                {editingId ? "Save Connection" : "Add Connection"}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(emptyModelConnection());
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function PresetSettings({
  modelConnections,
  modelPresets,
  upsertModelPreset,
  deleteModelPreset,
  testModelPreset,
}: {
  modelConnections: ModelConnection[];
  modelPresets: ModelPreset[];
  upsertModelPreset: (
    modelPreset: ModelPreset,
    editingId: string | null,
  ) => Promise<boolean>;
  deleteModelPreset: (presetId: string) => Promise<boolean>;
  testModelPreset: (presetId: string) => void;
}) {
  const [draft, setDraft] = useState<ModelPreset>(() =>
    emptyPreset(modelConnections.at(0)?.id),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const selectedConnection = modelConnections.find(
    (connection) => connection.id === draft.modelConnectionId,
  );
  const parameterSupport = selectedConnection
    ? connectionTypeParameterSupport[selectedConnection.type]
    : null;

  const savePreset = useCallback(() => {
    const selectedDraftConnection = modelConnections.find(
      (connection) => connection.id === draft.modelConnectionId,
    );

    if (
      !selectedDraftConnection ||
      !draft.name.trim() ||
      !draft.modelName.trim()
    ) {
      return;
    }

    setIsSaving(true);
    void upsertModelPreset(
      normalizePresetForConnectionType(draft, selectedDraftConnection.type),
      editingId,
    ).then((saved) => {
      setIsSaving(false);

      if (!saved) {
        return;
      }

      setDraft(emptyPreset(modelConnections.at(0)?.id));
      setEditingId(null);
    });
  }, [draft, editingId, modelConnections, upsertModelPreset]);

  return (
    <ScrollArea className="h-[calc(100dvh-10rem)]">
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          {modelPresets.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No model presets yet.
              </CardContent>
            </Card>
          ) : (
            modelPresets.map((preset) => {
              const presetConnection = getPresetConnection(
                modelConnections,
                preset,
              );

              return (
                <Card key={preset.id}>
                  <CardHeader>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate text-xl">
                        {preset.name}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>{preset.modelName}</span>
                        <span>
                          {presetConnection
                            ? `${presetConnection.name} · ${
                                connectionTypeLabels[presetConnection.type]
                              }`
                            : "Connection unavailable"}
                        </span>
                      </div>
                    </div>
                    <CardAction className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testModelPreset(preset.id)}
                      >
                        Test Connection
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(preset.id);
                          setDraft(preset);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${preset.name}`}
                        disabled={isSaving}
                        onClick={() => {
                          setIsSaving(true);
                          void deleteModelPreset(preset.id).then((saved) => {
                            setIsSaving(false);

                            if (saved && editingId === preset.id) {
                              setEditingId(null);
                              setDraft(emptyPreset(modelConnections.at(0)?.id));
                            }
                          });
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  {preset.testMessage && (
                    <CardContent>
                      <Badge
                        variant={
                          preset.testStatus === "error"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {preset.testMessage}
                      </Badge>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Model Preset" : "Add Model Preset"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {modelConnections.length === 0 && (
              <Badge variant="secondary" className="h-auto whitespace-normal">
                Create a connection before adding model presets.
              </Badge>
            )}
            <Field label="Preset Name" htmlFor="preset-name">
              <Input
                id="preset-name"
                value={draft.name}
                disabled={modelConnections.length === 0}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Model Connection" htmlFor="preset-connection">
              <Select
                value={draft.modelConnectionId}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      modelConnectionId: value,
                    }));
                  }
                }}
                disabled={modelConnections.length === 0}
              >
                <SelectTrigger id="preset-connection" className="w-full">
                  <SelectValue placeholder="Select model connection">
                    {(value: string | null) => {
                      const connection = modelConnections.find(
                        (item) => item.id === value,
                      );

                      return connection
                        ? `${connection.name} · ${
                            connectionTypeLabels[connection.type]
                          }`
                        : "Select model connection";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {modelConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name} ·{" "}
                      {connectionTypeLabels[connection.type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model name" htmlFor="preset-model">
              <Input
                id="preset-model"
                value={draft.modelName}
                disabled={modelConnections.length === 0}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    modelName: event.target.value,
                  }))
                }
              />
            </Field>
            {parameterSupport?.temperature && (
              <Field label={`Temperature ${draft.temperature.toFixed(1)}`}>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[draft.temperature]}
                    min={0}
                    max={2}
                    step={0.1}
                    onValueChange={(value) => {
                      const temperature = Array.isArray(value)
                        ? (value[0] ?? 0.7)
                        : value;
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        temperature,
                      }));
                    }}
                  />
                  <Input
                    aria-label="Temperature value"
                    className="w-20"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        temperature: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </Field>
            )}
            {parameterSupport?.outputLimit && (
              <Field label="Output limit" htmlFor="output-limit">
                <Input
                  id="output-limit"
                  type="number"
                  min={1}
                  value={draft.outputLimit}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      outputLimit: Number(event.target.value),
                    }))
                  }
                />
              </Field>
            )}
            {parameterSupport?.topP && (
              <Field label="Top P" htmlFor="top-p">
                <Input
                  id="top-p"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={draft.topP ?? 1}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      topP: Number(event.target.value),
                    }))
                  }
                />
              </Field>
            )}
            {parameterSupport?.frequencyPenalty && (
              <Field label="Frequency Penalty" htmlFor="frequency-penalty">
                <Input
                  id="frequency-penalty"
                  type="number"
                  min={-2}
                  max={2}
                  step={0.1}
                  value={draft.frequencyPenalty ?? 0}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      frequencyPenalty: Number(event.target.value),
                    }))
                  }
                />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isSaving || modelConnections.length === 0}
                onClick={savePreset}
              >
                <GitBranchIcon />
                {editingId ? "Save Preset" : "Add Preset"}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(emptyPreset(modelConnections.at(0)?.id));
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
