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
  CopyIcon,
  GitBranchIcon,
  PanelRightIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
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

import {
  availableTools,
  providerTypeLabels,
  type FlowEdge,
  type FlowNode,
  type ModelPreset,
  type Provider,
  type ProviderType,
  type Role,
  type TriggerMode,
  type WorkflowNodeData,
  type WorkflowNodeKind,
} from "./model";
import { WorkflowNode } from "./workflow-node";
import { isValidConnection, useFlowentWorkspaceStore } from "./workspace-store";

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
};

type AppView = "workflows" | "canvas" | "roles" | "settings";

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

const primaryNavigation: Array<{
  view: AppView;
  label: string;
  icon: typeof GitBranchIcon;
}> = [
  { view: "workflows", label: "Workflows", icon: GitBranchIcon },
  { view: "roles", label: "Roles", icon: BotIcon },
];

const systemNavigation: Array<{
  view: AppView;
  label: string;
  icon: typeof SettingsIcon;
}> = [{ view: "settings", label: "Settings", icon: SettingsIcon }];

function emptyRole(modelPresetId = ""): Role {
  return {
    id: "",
    name: "",
    avatar: "",
    systemPrompt: "",
    modelPresetId,
  };
}

function emptyProvider(): Provider {
  return {
    id: "",
    type: "openai",
    name: "",
    apiKey: "",
    baseUrl: "",
  };
}

function emptyPreset(providerId = ""): ModelPreset {
  return {
    id: "",
    name: "",
    providerId,
    modelId: "",
    temperature: 0.7,
    maxTokens: 1200,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    nodes,
    edges,
    modelPresets,
    roles,
    selectedNodeIds,
    selectedEdgeIds,
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
  } = useFlowentWorkspaceStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      modelPresets: state.modelPresets,
      roles: state.roles,
      selectedNodeIds: state.selectedNodeIds,
      selectedEdgeIds: state.selectedEdgeIds,
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
    })),
  );

  const nodesWithContext = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          modelPresets,
        },
      })),
    [modelPresets, nodes],
  );

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [nodes, selectedNodeIds],
  );

  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const clearRunTimers = useCallback(() => {
    runTimers.current.forEach((timer) => window.clearTimeout(timer));
    runTimers.current = [];
  }, []);

  useEffect(() => clearRunTimers, [clearRunTimers]);

  const runWorkflow = useCallback(() => {
    clearRunTimers();
    startWorkflowRun();

    runTimers.current = [
      window.setTimeout(() => {
        advanceWorkflowRun();
      }, 800),
      window.setTimeout(() => {
        finishWorkflowRun();
      }, 1600),
    ];
  }, [advanceWorkflowRun, clearRunTimers, finishWorkflowRun, startWorkflowRun]);

  const onDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, kind: WorkflowNodeKind) => {
      event.dataTransfer.setData("application/flowent-node", kind);
      event.dataTransfer.effectAllowed = "copy";
    },
    [],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/flowent-node");

      if (!isWorkflowNodeKind(kind)) {
        return;
      }

      addWorkflowNode(
        kind,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addWorkflowNode, screenToFlowPosition],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      addWorkflowNode(
        "agent",
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addWorkflowNode, screenToFlowPosition],
  );

  return (
    <TooltipProvider>
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-dvh overflow-hidden bg-background text-foreground"
      >
        <AppSidebar
          activeView={activeView === "canvas" ? "workflows" : activeView}
          collapsed={sidebarCollapsed}
          onNavigate={setActiveView}
          onToggleCollapsed={() =>
            setSidebarCollapsed((collapsed) => !collapsed)
          }
        />
        <div className="min-w-0 flex-1">
          {activeView === "canvas" ? (
            <div className="grid h-full min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-1">
              <CanvasWorkspace
                nodes={nodesWithContext}
                edges={edges}
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
                onRun={runWorkflow}
                onDeleteSelection={deleteSelection}
                onFitView={() => fitView({ padding: 0.2, duration: 250 })}
                onResetViewport={() =>
                  setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 })
                }
              />
              <aside className="min-h-0 border-t bg-card lg:border-t-0 lg:border-l">
                <PropertyPanel
                  selectedNode={selectedNode}
                  selectedCount={
                    selectedNodeIds.length + selectedEdgeIds.length
                  }
                  modelPresets={modelPresets}
                  updateNodeData={updateNodeData}
                />
              </aside>
            </div>
          ) : activeView === "roles" ? (
            <RolesLibrary
              roles={roles}
              modelPresets={modelPresets}
              nodeCount={nodes.length}
              upsertRole={upsertRole}
              deleteRole={deleteRole}
              addAgentFromRole={addAgentFromRole}
              onOpenCanvas={() => setActiveView("canvas")}
            />
          ) : activeView === "settings" ? (
            <SettingsView />
          ) : (
            <WorkflowDashboard
              nodeCount={nodes.length}
              roleCount={roles.length}
              modelPresetCount={modelPresets.length}
              onOpenCanvas={() => setActiveView("canvas")}
            />
          )}
        </div>
      </motion.main>
    </TooltipProvider>
  );
}

function AppSidebar({
  activeView,
  collapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  activeView: AppView;
  collapsed: boolean;
  onNavigate: (view: AppView) => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 232 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="shrink-0 border-r bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-full flex-col gap-4 p-3">
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
        <nav className="space-y-1">
          {primaryNavigation.map((item) => (
            <SidebarNavButton
              key={item.view}
              item={item}
              collapsed={collapsed}
              active={activeView === item.view}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <Separator />
          <nav className="space-y-1">
            {systemNavigation.map((item) => (
              <SidebarNavButton
                key={item.view}
                item={item}
                collapsed={collapsed}
                active={activeView === item.view}
                onNavigate={onNavigate}
              />
            ))}
          </nav>
        </div>
      </div>
    </motion.aside>
  );
}

function SidebarNavButton({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: (typeof primaryNavigation)[number] | (typeof systemNavigation)[number];
  collapsed: boolean;
  active: boolean;
  onNavigate: (view: AppView) => void;
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
      onClick={() => onNavigate(item.view)}
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

function WorkflowDashboard({
  nodeCount,
  roleCount,
  modelPresetCount,
  onOpenCanvas,
}: {
  nodeCount: number;
  roleCount: number;
  modelPresetCount: number;
  onOpenCanvas: () => void;
}) {
  return (
    <ScrollArea className="h-full">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Workflows</h1>
          </div>
          <Button onClick={onOpenCanvas}>
            <PanelRightIcon />
            Open Canvas
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Workflow" value="1 active" />
          <MetricCard label="Nodes" value={String(nodeCount)} />
          <MetricCard label="Roles" value={String(roleCount)} />
          <MetricCard label="Models" value={String(modelPresetCount)} />
        </div>
        <Card className="rounded-lg p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-2xl">Launch Campaign Workflow</CardTitle>
            <CardAction>
              <Button size="sm" onClick={onOpenCanvas}>
                Open
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 px-0 pb-0 text-base md:grid-cols-3">
            <div>Trigger: Manual Trigger</div>
            <div>First Agent: Copywriter</div>
            <div>Status: Draft</div>
          </CardContent>
        </Card>
      </section>
    </ScrollArea>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-lg p-6">
      <div className="text-lg font-medium">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </Card>
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
  onOpenCanvas,
}: {
  role: Role;
  modelPresets: ModelPreset[];
  nodeCount: number;
  isEditing: boolean;
  addAgentFromRole: (roleId: string, position: FlowNode["position"]) => void;
  deleteRole: (roleId: string) => void;
  setDraft: React.Dispatch<React.SetStateAction<Role>>;
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenCanvas: () => void;
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
              onOpenCanvas();
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
      </CardContent>
    </Card>
  );
}

function CanvasWorkspace({
  nodes,
  edges,
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
  onRun,
  onDeleteSelection,
  onFitView,
  onResetViewport,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
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
  onRun: () => void;
  onDeleteSelection: () => void;
  onFitView: () => void;
  onResetViewport: () => void;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-medium">
            Launch Campaign Workflow
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NodeLibrary onDragStart={onDragStart} onQuickAdd={onQuickAdd} />
          <Separator orientation="vertical" className="hidden h-7 sm:block" />
          <Button onClick={onRun}>
            <PlayIcon />
            Run
          </Button>
          <Button
            variant="outline"
            onClick={onDeleteSelection}
            disabled={
              selectedNodeIds.length === 0 && selectedEdgeIds.length === 0
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
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
          onPaneContextMenu={onPaneContextMenu}
          onNodesDelete={onNodesDelete}
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
          multiSelectionKeyCode="Shift"
          deleteKeyCode={["Backspace", "Delete"]}
          selectionOnDrag
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) =>
              node.data.kind === "trigger" ? "var(--chart-3)" : "var(--muted)"
            }
            maskColor="oklch(0 0 0 / 40%)"
          />
        </ReactFlow>
      </div>
    </section>
  );
}

function NodeLibrary({
  onDragStart,
  onQuickAdd,
}: {
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
              draggable
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
  modelPresets,
  updateNodeData,
}: {
  selectedNode: FlowNode | null;
  selectedCount: number;
  modelPresets: ModelPreset[];
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-xl font-medium">Properties</h2>
        </div>
        <Separator />
        {selectedNode ? (
          selectedNode.data.kind === "trigger" ? (
            <TriggerProperties
              node={selectedNode}
              updateNodeData={updateNodeData}
            />
          ) : (
            <AgentProperties
              node={selectedNode}
              modelPresets={modelPresets}
              updateNodeData={updateNodeData}
            />
          )
        ) : (
          <WorkflowSummary
            selectedCount={selectedCount}
            modelPresets={modelPresets}
          />
        )}
      </div>
    </ScrollArea>
  );
}

function TriggerProperties({
  node,
  updateNodeData,
}: {
  node: FlowNode;
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}) {
  const mode = node.data.triggerMode ?? "manual";

  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor="trigger-name">
        <Input
          id="trigger-name"
          value={node.data.title}
          onChange={(event) =>
            updateNodeData(node.id, { title: event.target.value })
          }
        />
      </Field>
      <Field label="Trigger Type" htmlFor="trigger-type">
        <Select
          value={mode}
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
              readOnly
              value={node.data.webhookUrl ?? ""}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy webhook URL"
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
  modelPresets,
  updateNodeData,
}: {
  node: FlowNode;
  modelPresets: ModelPreset[];
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
}) {
  const selectedPreset =
    node.data.modelPresetId ?? modelPresets.at(0)?.id ?? "";
  const tools = node.data.tools ?? [];

  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor="agent-name">
        <Input
          id="agent-name"
          value={node.data.title}
          onChange={(event) =>
            updateNodeData(node.id, {
              title: event.target.value,
              name: event.target.value,
            })
          }
        />
      </Field>
      <Field label="Model Preset" htmlFor="model-preset">
        <Select
          value={selectedPreset}
          onValueChange={(value) => {
            if (typeof value === "string") {
              updateNodeData(node.id, { modelPresetId: value });
            }
          }}
          disabled={modelPresets.length === 0}
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
                {preset.name} · {preset.modelId}
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
      {node.data.status === "error" && node.data.errorMessage && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {node.data.errorMessage}
        </div>
      )}
    </div>
  );
}

function WorkflowSummary({
  selectedCount,
  modelPresets,
}: {
  selectedCount: number;
  modelPresets: ModelPreset[];
}) {
  return (
    <div className="space-y-4">
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
  onOpenCanvas,
}: {
  roles: Role[];
  modelPresets: ModelPreset[];
  nodeCount: number;
  upsertRole: (role: Role, editingId: string | null) => void;
  deleteRole: (roleId: string) => void;
  addAgentFromRole: (roleId: string, position: FlowNode["position"]) => void;
  onOpenCanvas: () => void;
}) {
  const [draft, setDraft] = useState<Role>(() =>
    emptyRole(modelPresets.at(0)?.id),
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const saveRole = useCallback(() => {
    if (
      !draft.name.trim() ||
      !draft.systemPrompt.trim() ||
      !draft.modelPresetId
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
  }, [draft, editingId, modelPresets, upsertRole]);

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
                roles[0]?.id ?? "",
                getRoleNodePosition(nodeCount),
              );
              onOpenCanvas();
            }}
            disabled={roles.length === 0}
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
                onOpenCanvas={onOpenCanvas}
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
                <Select
                  value={draft.modelPresetId}
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
                        {preset.name} · {preset.modelId}
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

function SettingsView() {
  const {
    providers,
    modelPresets,
    upsertProvider,
    deleteProvider,
    upsertModelPreset,
    deleteModelPreset,
    testModelPreset,
  } = useFlowentWorkspaceStore(
    useShallow((state) => ({
      providers: state.providers,
      modelPresets: state.modelPresets,
      upsertProvider: state.upsertProvider,
      deleteProvider: state.deleteProvider,
      upsertModelPreset: state.upsertModelPreset,
      deleteModelPreset: state.deleteModelPreset,
      testModelPreset: state.testModelPreset,
    })),
  );

  return (
    <section className="flex h-full min-w-0 flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
      </div>
      <Tabs defaultValue="providers" className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="presets">Model Presets</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="min-h-0">
          <ProviderSettings
            providers={providers}
            upsertProvider={upsertProvider}
            deleteProvider={deleteProvider}
          />
        </TabsContent>
        <TabsContent value="presets" className="min-h-0">
          <PresetSettings
            providers={providers}
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

function ProviderSettings({
  providers,
  upsertProvider,
  deleteProvider,
}: {
  providers: Provider[];
  upsertProvider: (provider: Provider, editingId: string | null) => void;
  deleteProvider: (providerId: string) => void;
}) {
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [editingId, setEditingId] = useState<string | null>(null);

  const saveProvider = useCallback(() => {
    if (!draft.name.trim()) {
      return;
    }

    upsertProvider(draft, editingId);
    setDraft(emptyProvider());
    setEditingId(null);
  }, [draft, editingId, upsertProvider]);

  return (
    <ScrollArea className="h-[calc(100dvh-10rem)]">
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardHeader>
                <CardTitle className="text-xl">{provider.name}</CardTitle>
                <CardAction className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingId(provider.id);
                      setDraft({ ...provider, apiKey: "" });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${provider.name}`}
                    onClick={() => deleteProvider(provider.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Provider" : "Add Provider"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Provider Type" htmlFor="provider-type">
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    type: value as ProviderType,
                  }))
                }
              >
                <SelectTrigger id="provider-type" className="w-full">
                  <SelectValue>
                    {(value: ProviderType | null) =>
                      value ? providerTypeLabels[value] : "OpenAI"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(providerTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name" htmlFor="provider-name">
              <Input
                id="provider-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="API Key" htmlFor="provider-key">
              <Input
                id="provider-key"
                type="password"
                value={draft.apiKey}
                placeholder={editingId ? "Leave blank to keep saved key" : ""}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    apiKey: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Base URL" htmlFor="provider-base-url">
              <Input
                id="provider-base-url"
                value={draft.baseUrl}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    baseUrl: event.target.value,
                  }))
                }
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={saveProvider}>
                <PlusIcon />
                {editingId ? "Save Provider" : "Add Provider"}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(emptyProvider());
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
  providers,
  modelPresets,
  upsertModelPreset,
  deleteModelPreset,
  testModelPreset,
}: {
  providers: Provider[];
  modelPresets: ModelPreset[];
  upsertModelPreset: (
    modelPreset: ModelPreset,
    editingId: string | null,
  ) => void;
  deleteModelPreset: (presetId: string) => void;
  testModelPreset: (presetId: string) => void;
}) {
  const [draft, setDraft] = useState<ModelPreset>(() =>
    emptyPreset(providers.at(0)?.id),
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const savePreset = useCallback(() => {
    if (!draft.name.trim() || !draft.providerId || !draft.modelId.trim()) {
      return;
    }

    upsertModelPreset(draft, editingId);
    setDraft(emptyPreset(providers.at(0)?.id));
    setEditingId(null);
  }, [draft, editingId, providers, upsertModelPreset]);

  return (
    <ScrollArea className="h-[calc(100dvh-10rem)]">
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          {modelPresets.map((preset) => {
            return (
              <Card key={preset.id}>
                <CardHeader>
                  <CardTitle className="text-xl">{preset.name}</CardTitle>
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
                      onClick={() => deleteModelPreset(preset.id)}
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
          })}
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Model Preset" : "Add Model Preset"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Preset Name" htmlFor="preset-name">
              <Input
                id="preset-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Provider" htmlFor="preset-provider">
              <Select
                value={draft.providerId}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      providerId: value,
                    }));
                  }
                }}
                disabled={providers.length === 0}
              >
                <SelectTrigger id="preset-provider" className="w-full">
                  <SelectValue placeholder="Select provider">
                    {(value: string | null) =>
                      providers.find((provider) => provider.id === value)
                        ?.name ?? "Select provider"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model ID" htmlFor="preset-model">
              <Input
                id="preset-model"
                value={draft.modelId}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    modelId: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label={`Temperature ${draft.temperature.toFixed(1)}`}>
              <div className="flex items-center gap-3">
                <Slider
                  value={[draft.temperature]}
                  min={0}
                  max={2}
                  step={0.1}
                  onValueChange={(value) => {
                    const temperature = Array.isArray(value) ? value[0] : value;
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
            <Field label="Max Tokens" htmlFor="max-tokens">
              <Input
                id="max-tokens"
                type="number"
                value={draft.maxTokens}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    maxTokens: Number(event.target.value),
                  }))
                }
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={savePreset}>
                <GitBranchIcon />
                {editingId ? "Save Preset" : "Add Preset"}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(emptyPreset(providers.at(0)?.id));
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
