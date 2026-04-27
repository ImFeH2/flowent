"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import { motion } from "framer-motion";
import {
  BotIcon,
  CopyIcon,
  GitBranchIcon,
  LibraryIcon,
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
  CardDescription,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  availableTools,
  providerTypeLabels,
  type FlowNode,
  type ModelPreset,
  type Provider,
  type ProviderType,
  type TriggerMode,
  type WorkflowNodeData,
  type WorkflowNodeKind,
} from "./model";
import { WorkflowNode } from "./workflow-node";
import { isValidConnection, useFlowentWorkspaceStore } from "./workspace-store";

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
};

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

function maskKey(apiKey: string) {
  return apiKey ? "••••••••••••" : "Not saved";
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
  const {
    nodes,
    edges,
    modelPresets,
    selectedNodeIds,
    selectedEdgeIds,
    settingsOpen,
    setSettingsOpen,
    setSelection,
    applyNodeChanges,
    applyEdgeChanges,
    connectNodes,
    addWorkflowNode,
    addQuickNode,
    deleteSelection,
    deleteConnectedEdges,
    updateNodeData,
    startWorkflowRun,
    advanceWorkflowRun,
    finishWorkflowRun,
  } = useFlowentWorkspaceStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      modelPresets: state.modelPresets,
      selectedNodeIds: state.selectedNodeIds,
      selectedEdgeIds: state.selectedEdgeIds,
      settingsOpen: state.settingsOpen,
      setSettingsOpen: state.setSettingsOpen,
      setSelection: state.setSelection,
      applyNodeChanges: state.applyNodeChanges,
      applyEdgeChanges: state.applyEdgeChanges,
      connectNodes: state.connectNodes,
      addWorkflowNode: state.addWorkflowNode,
      addQuickNode: state.addQuickNode,
      deleteSelection: state.deleteSelection,
      deleteConnectedEdges: state.deleteConnectedEdges,
      updateNodeData: state.updateNodeData,
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
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid h-dvh grid-cols-1 grid-rows-[auto_minmax(26rem,1fr)_auto] overflow-hidden bg-background lg:grid-cols-[18rem_minmax(0,1fr)_23rem] lg:grid-rows-1"
    >
      <aside className="border-b bg-sidebar text-sidebar-foreground lg:border-r lg:border-b-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">Flowent</h1>
                <p className="text-sm text-muted-foreground">
                  Workflow orchestration
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={runWorkflow} className="w-full">
                <PlayIcon />
                Run
              </Button>
              <Button
                variant="outline"
                onClick={deleteSelection}
                disabled={
                  selectedNodeIds.length === 0 && selectedEdgeIds.length === 0
                }
              >
                <Trash2Icon />
                Delete
              </Button>
            </div>
            <NodeLibrary onDragStart={onDragStart} onQuickAdd={addQuickNode} />
            <Card size="sm">
              <CardHeader>
                <CardTitle>Canvas</CardTitle>
                <CardDescription>
                  Viewport and topology controls
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => fitView({ padding: 0.2, duration: 250 })}
                >
                  <PanelRightIcon />
                  Fit
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 })
                  }
                >
                  100%
                </Button>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </aside>
      <section className="min-h-0 bg-background">
        <ReactFlow
          nodes={nodesWithContext}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={applyNodeChanges}
          onEdgesChange={applyEdgeChanges}
          onConnect={connectNodes}
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
          onPaneContextMenu={onPaneContextMenu}
          onNodesDelete={deleteConnectedEdges}
          onSelectionChange={({
            nodes: selectionNodes,
            edges: selectionEdges,
          }) => {
            setSelection(
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
      </section>
      <aside className="min-h-0 border-t bg-card lg:border-t-0 lg:border-l">
        <PropertyPanel
          selectedNode={selectedNode}
          selectedCount={selectedNodeIds.length + selectedEdgeIds.length}
          modelPresets={modelPresets}
          updateNodeData={updateNodeData}
        />
      </aside>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </motion.main>
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
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LibraryIcon className="size-4" />
          Node Library
        </CardTitle>
        <CardDescription>Available execution units</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {nodeLibrary.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.kind}
              className="flex items-center gap-2 rounded-lg border bg-background p-2"
            >
              <Button
                variant="ghost"
                draggable
                onDragStart={(event) => onDragStart(event, item.kind)}
                className="h-auto flex-1 justify-start gap-3 px-2 py-2"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Add ${item.title}`}
                onClick={() => onQuickAdd(item.kind)}
              >
                <PlusIcon />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
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
          <h2 className="text-base font-medium">Properties</h2>
          <p className="text-sm text-muted-foreground">
            {selectedNode
              ? selectedNode.data.title
              : selectedCount > 1
                ? `${selectedCount} items selected`
                : "Workflow"}
          </p>
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
            updateNodeData(node.id, { title: event.target.value })
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
    <div className="space-y-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Selection</CardTitle>
          <CardDescription>
            {selectedCount > 0 ? `${selectedCount} items` : "No active item"}
          </CardDescription>
        </CardHeader>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Model Presets</CardTitle>
          <CardDescription>{modelPresets.length} available</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Manage providers and model presets for Agent nodes.
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="providers" className="min-h-0 flex-1 px-4 pb-4">
          <TabsList className="w-full">
            <TabsTrigger value="providers" className="flex-1">
              Providers
            </TabsTrigger>
            <TabsTrigger value="presets" className="flex-1">
              Model Presets
            </TabsTrigger>
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
      </SheetContent>
    </Sheet>
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
            <Card key={provider.id} size="sm">
              <CardHeader>
                <CardTitle>{provider.name}</CardTitle>
                <CardDescription>
                  {providerTypeLabels[provider.type]} ·{" "}
                  {maskKey(provider.apiKey)}
                </CardDescription>
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
            const provider = providers.find(
              (item) => item.id === preset.providerId,
            );

            return (
              <Card key={preset.id} size="sm">
                <CardHeader>
                  <CardTitle>{preset.name}</CardTitle>
                  <CardDescription>
                    {provider?.name ?? "No provider"} · {preset.modelId}
                  </CardDescription>
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
