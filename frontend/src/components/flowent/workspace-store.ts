"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getConnectedEdges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";

import {
  createNode,
  initialBlueprints,
  initialModelConnections,
  initialModelPresets,
  initialRoles,
  snapCanvasPosition,
  availableTools,
  type BlueprintAsset,
  type FlowEdge,
  type FlowNode,
  type ModelConnection,
  type ModelPreset,
  type NodeRunDetails,
  type Role,
  type RunStatus,
  type WorkflowNodeData,
  type WorkflowNodeKind,
  type WorkflowRunStatus,
} from "./model";

type FrozenRunGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  modelPresets: ModelPreset[];
};

type WorkspaceState = {
  blueprints: BlueprintAsset[];
  activeBlueprintId: string | null;
  modelConnections: ModelConnection[];
  modelPresets: ModelPreset[];
  roles: Role[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  workflowRunStatus: WorkflowRunStatus;
  runStartedAt: string | null;
  runBlockedReason: string | null;
  frozenRunGraph: FrozenRunGraph | null;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  nextNodeIndex: number;
  localDataStatus: "loading" | "ready" | "saving" | "error";
  localDataMessage: string | null;
  hasLoadedLocalData: boolean;
};

type WorkspaceActions = {
  loadLocalSettings: () => Promise<void>;
  createBlueprint: (name?: string) => string;
  openBlueprint: (blueprintId: string) => void;
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;
  applyNodeChanges: (changes: NodeChange<FlowNode>[]) => void;
  applyEdgeChanges: (changes: EdgeChange<FlowEdge>[]) => void;
  connectNodes: (connection: Connection) => void;
  addWorkflowNode: (
    kind: WorkflowNodeKind,
    position: FlowNode["position"],
  ) => void;
  addQuickNode: (kind: WorkflowNodeKind) => void;
  deleteSelection: () => void;
  deleteConnectedEdges: (deletedNodes: FlowNode[]) => void;
  updateNodeData: (nodeId: string, patch: Partial<WorkflowNodeData>) => void;
  startWorkflowRun: () => void;
  advanceWorkflowRun: () => void;
  finishWorkflowRun: () => void;
  cancelWorkflowRun: () => void;
  upsertModelConnection: (
    modelConnection: ModelConnection,
    editingId: string | null,
  ) => Promise<boolean>;
  deleteModelConnection: (modelConnectionId: string) => Promise<boolean>;
  upsertModelPreset: (
    modelPreset: ModelPreset,
    editingId: string | null,
  ) => Promise<boolean>;
  deleteModelPreset: (presetId: string) => Promise<boolean>;
  testModelPreset: (presetId: string) => void;
  upsertRole: (role: Role, editingId: string | null) => void;
  deleteRole: (roleId: string) => void;
  addAgentFromRole: (roleId: string, position: FlowNode["position"]) => void;
};

export type FlowentWorkspaceStore = WorkspaceState & WorkspaceActions;

type LocalSettingsSnapshot = {
  version?: number;
  modelConnections: ModelConnection[];
  modelPresets: ModelPreset[];
  blueprints: BlueprintAsset[];
  roles: Role[];
};

type LocalSettingsResponse = {
  saved?: boolean;
  settings?: LocalSettingsSnapshot | null;
  error?: string;
};

const localSettingsEndpoint = "/api/settings";
const localDataSaveMessage = "Saving changes...";
const localDataLoadErrorMessage = "Saved settings could not be loaded.";
const localDataSaveErrorMessage =
  "Changes could not be saved. Check that Flowent can write to your home folder.";

function areSameIds(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneRunDetails(runDetails: NodeRunDetails | undefined) {
  if (!runDetails) {
    return undefined;
  }

  if (runDetails.kind === "agent") {
    return {
      ...runDetails,
      conversation: runDetails.conversation.map((entry) => ({ ...entry })),
    };
  }

  return { ...runDetails };
}

function cloneNodes(nodes: FlowNode[]) {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: {
      ...node.data,
      tools: node.data.tools ? [...node.data.tools] : node.data.tools,
      runDetails: cloneRunDetails(node.data.runDetails),
    },
  }));
}

function cloneEdges(edges: FlowEdge[]) {
  return edges.map((edge) => ({ ...edge }));
}

function cloneModelConnections(modelConnections: ModelConnection[]) {
  return modelConnections.map((modelConnection) => ({ ...modelConnection }));
}

function cloneModelPresets(modelPresets: ModelPreset[]) {
  return modelPresets.map((preset) => ({
    ...preset,
    testStatus: "idle" as const,
    testMessage: undefined,
  }));
}

function cloneFrozenModelPresets(modelPresets: ModelPreset[]) {
  return modelPresets.map((preset) => ({ ...preset }));
}

function cloneRoles(roles: Role[]) {
  return roles.map((role) => ({ ...role }));
}

function cloneBlueprint(blueprint: BlueprintAsset): BlueprintAsset {
  const graph = resetRunState(
    cloneNodes(blueprint.nodes),
    cloneEdges(blueprint.edges),
  );

  return {
    ...blueprint,
    nodes: graph.nodes,
    edges: graph.edges,
  };
}

function getNextNodeIndex(nodes: FlowNode[]) {
  const lastIndex = nodes.reduce((highest, node) => {
    const match = /-(\d+)$/.exec(node.id);

    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]));
  }, 0);

  return lastIndex + 1;
}

function hasAvailableModelPreset(
  modelPresets: ModelPreset[],
  presetId: string | undefined,
) {
  return Boolean(
    presetId && modelPresets.some((preset) => preset.id === presetId),
  );
}

function createLocalSettingsSnapshot(
  state: WorkspaceState,
): LocalSettingsSnapshot {
  return {
    modelConnections: cloneModelConnections(state.modelConnections),
    modelPresets: cloneModelPresets(state.modelPresets),
    blueprints: state.blueprints.map(cloneBlueprint),
    roles: cloneRoles(state.roles),
  };
}

function getLocalDataErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

async function parseLocalSettingsResponse(response: Response) {
  const body = await response
    .json()
    .catch(() => null as LocalSettingsResponse | null);

  if (!body) {
    throw new Error(
      response.ok ? localDataLoadErrorMessage : localDataSaveErrorMessage,
    );
  }

  if (!response.ok) {
    throw new Error(body.error || localDataSaveErrorMessage);
  }

  return body;
}

async function readLocalSettings() {
  const response = await fetch(localSettingsEndpoint, {
    cache: "no-store",
  });

  return parseLocalSettingsResponse(response);
}

async function saveLocalSettings(snapshot: LocalSettingsSnapshot) {
  const response = await fetch(localSettingsEndpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ settings: snapshot }),
  });
  const body = await parseLocalSettingsResponse(response);

  if (!body.settings) {
    throw new Error(localDataSaveErrorMessage);
  }

  return body.settings;
}

function applyLocalSettingsSnapshot(
  snapshot: LocalSettingsSnapshot,
): Partial<WorkspaceState> {
  const blueprints = snapshot.blueprints.map(cloneBlueprint);
  const activeBlueprint = blueprints.at(0);
  const graph = resetRunState(
    cloneNodes(activeBlueprint?.nodes ?? []),
    cloneEdges(activeBlueprint?.edges ?? []),
  );

  return {
    modelConnections: cloneModelConnections(snapshot.modelConnections),
    modelPresets: cloneModelPresets(snapshot.modelPresets),
    blueprints,
    activeBlueprintId: activeBlueprint?.id ?? null,
    roles: cloneRoles(snapshot.roles),
    nodes: graph.nodes,
    edges: graph.edges,
    workflowRunStatus: "idle",
    runStartedAt: null,
    runBlockedReason: null,
    frozenRunGraph: null,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    nextNodeIndex: getNextNodeIndex(graph.nodes),
    localDataStatus: "ready",
    localDataMessage: null,
    hasLoadedLocalData: true,
  };
}

function updateActiveBlueprint(
  state: WorkspaceState,
  nodes: FlowNode[],
  edges: FlowEdge[],
  patch: Partial<Pick<BlueprintAsset, "name" | "summary" | "updatedAt">> = {},
) {
  if (!state.activeBlueprintId) {
    return state.blueprints;
  }

  return state.blueprints.map((blueprint) =>
    blueprint.id === state.activeBlueprintId
      ? {
          ...blueprint,
          ...patch,
          updatedAt: patch.updatedAt ?? new Date().toISOString(),
          nodes: cloneNodes(nodes),
          edges: cloneEdges(edges),
        }
      : blueprint,
  );
}

function isValidConnection(connection: Connection | Edge) {
  return (
    connection.source !== connection.target &&
    connection.sourceHandle === "output" &&
    connection.targetHandle === "input"
  );
}

function snapNodeChange(change: NodeChange<FlowNode>): NodeChange<FlowNode> {
  if (change.type === "position" && change.position && !change.dragging) {
    return {
      ...change,
      position: snapCanvasPosition(change.position),
      positionAbsolute: change.positionAbsolute
        ? snapCanvasPosition(change.positionAbsolute)
        : change.positionAbsolute,
    };
  }

  if (change.type === "add") {
    return {
      ...change,
      item: {
        ...change.item,
        position: snapCanvasPosition(change.item.position),
      },
    };
  }

  if (change.type === "replace") {
    return {
      ...change,
      item: {
        ...change.item,
        position: snapCanvasPosition(change.item.position),
      },
    };
  }

  return change;
}

function shouldPersistNodeChanges(changes: NodeChange<FlowNode>[]) {
  return changes.some((change) => {
    if (change.type === "position") {
      return change.dragging !== true;
    }

    return (
      change.type === "add" ||
      change.type === "remove" ||
      change.type === "replace"
    );
  });
}

function shouldPersistEdgeChanges(changes: EdgeChange<FlowEdge>[]) {
  return changes.some((change) => change.type !== "select");
}

function isStructuralNodeChange(change: NodeChange<FlowNode>) {
  return (
    change.type === "add" ||
    change.type === "remove" ||
    change.type === "replace"
  );
}

function isStructuralEdgeChange(change: EdgeChange<FlowEdge>) {
  return change.type === "add" || change.type === "remove";
}

function resetRunState(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        status: "idle" as const,
        runDetails: undefined,
        errorMessage: undefined,
      },
    })),
    edges: edges.map((edge) => ({ ...edge, animated: false })),
  };
}

function findModelPreset(
  modelPresets: ModelPreset[],
  presetId: string | undefined,
) {
  return modelPresets.find((preset) => preset.id === presetId);
}

function getToolLabels(toolIds: string[] | undefined) {
  return (toolIds ?? []).map(
    (toolId) =>
      availableTools.find((tool) => tool.id === toolId)?.label ?? toolId,
  );
}

function replacePayloadReferences(template: string, payload: string) {
  return template
    .replaceAll("{{payload}}", payload)
    .replaceAll("{{input}}", payload);
}

function getUpstreamPayload(
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
) {
  return edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => nodes.find((item) => item.id === edge.source))
    .map((sourceNode) => {
      if (!sourceNode) {
        return "";
      }

      if (sourceNode.data.runDetails?.outputPayload) {
        return sourceNode.data.runDetails.outputPayload;
      }

      if (sourceNode.data.kind === "trigger") {
        return sourceNode.data.initialPayload ?? "";
      }

      return sourceNode.data.title
        ? `${sourceNode.data.title} output is not available yet.`
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildNodeRunDetails(
  node: FlowNode,
  status: Exclude<RunStatus, "idle" | "pending" | "canceled">,
  nodes: FlowNode[],
  edges: FlowEdge[],
  modelPresets: ModelPreset[],
): NodeRunDetails {
  if (node.data.kind === "trigger") {
    const payload = node.data.initialPayload?.trim() || "No trigger input.";

    return {
      kind: "trigger",
      inputPayload: payload,
      outputPayload: payload,
    };
  }

  const upstreamPayload =
    getUpstreamPayload(node, nodes, edges).trim() || "No upstream payload.";
  const preset = findModelPreset(modelPresets, node.data.modelPresetId);
  const systemPrompt = replacePayloadReferences(
    node.data.systemPrompt?.trim() || "No system prompt was set.",
    upstreamPayload,
  );
  const toolLabels = getToolLabels(node.data.tools);
  const toolSummary =
    toolLabels.length > 0
      ? `Available tools: ${toolLabels.join(", ")}.\nNo live tool result was needed for this run preview.`
      : "No tools were selected for this run.";
  const outputPayload =
    status === "running"
      ? `${node.data.title} is preparing a response from the received input.`
      : status === "error"
        ? node.data.errorMessage ||
          `${node.data.title} stopped before sending a result.`
        : `${node.data.title} completed the step from the received input.`;

  return {
    kind: "agent",
    inputPayload: upstreamPayload,
    outputPayload,
    modelPresetName: preset?.name,
    modelName: preset?.modelName,
    conversation: [
      {
        id: `${node.id}-system`,
        role: "system",
        content: systemPrompt,
      },
      {
        id: `${node.id}-user`,
        role: "user",
        content: upstreamPayload,
      },
      {
        id: `${node.id}-tool-calls`,
        role: "tool-calls",
        content: toolSummary,
      },
      {
        id: `${node.id}-assistant`,
        role: "assistant",
        content: outputPayload,
      },
    ],
  };
}

function applyRunStatus(
  node: FlowNode,
  status: RunStatus,
  nodes: FlowNode[],
  edges: FlowEdge[],
  modelPresets: ModelPreset[],
) {
  const runDetails =
    status === "idle" || status === "pending" || status === "canceled"
      ? node.data.runDetails
      : buildNodeRunDetails(node, status, nodes, edges, modelPresets);

  return {
    ...node,
    data: { ...node.data, status, runDetails },
  };
}

function applyRunStatuses(
  nodes: FlowNode[],
  edges: FlowEdge[],
  modelPresets: ModelPreset[],
  getStatus: (node: FlowNode) => RunStatus,
) {
  const nextNodes: FlowNode[] = [];

  for (const node of nodes) {
    const contextNodes = nodes.map(
      (item) => nextNodes.find((nextNode) => nextNode.id === item.id) ?? item,
    );

    nextNodes.push(
      applyRunStatus(node, getStatus(node), contextNodes, edges, modelPresets),
    );
  }

  return nextNodes;
}

function mergeRunStateIntoLiveNodes(
  liveNodes: FlowNode[],
  runNodes: FlowNode[],
) {
  const runNodeById = new Map(runNodes.map((node) => [node.id, node]));

  return liveNodes.map((node) => {
    const runNode = runNodeById.get(node.id);

    if (!runNode) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        status: runNode.data.status,
        errorMessage: runNode.data.errorMessage,
        runDetails: cloneRunDetails(runNode.data.runDetails),
      },
    };
  });
}

function cancelRunNodes(nodes: FlowNode[]) {
  return nodes.map((node) => {
    if (node.data.status === "running") {
      return {
        ...node,
        data: { ...node.data, status: "canceled" as const },
      };
    }

    if (node.data.status === "pending") {
      return {
        ...node,
        data: {
          ...node.data,
          status: "idle" as const,
          runDetails: undefined,
          errorMessage: undefined,
        },
      };
    }

    return node;
  });
}

function detectGraphCycle(nodes: FlowNode[], edges: FlowEdge[]) {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) {
    color.set(node.id, WHITE);
  }

  const stack: string[] = [];
  for (const node of nodes) {
    if (color.get(node.id) !== WHITE) continue;
    stack.push(node.id);
    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (color.get(current) === WHITE) {
        color.set(current, GRAY);
      }
      const neighbors = adjacency.get(current) ?? [];
      const next = neighbors.find((id) => color.get(id) !== BLACK);
      if (next === undefined) {
        color.set(current, BLACK);
        stack.pop();
      } else if (color.get(next) === GRAY) {
        return true;
      } else {
        stack.push(next);
      }
    }
  }

  return false;
}

function findReachableFromTriggers(nodes: FlowNode[], edges: FlowEdge[]) {
  const triggerIds = nodes
    .filter((node) => node.data.kind === "trigger")
    .map((node) => node.id);
  const reachable = new Set<string>(triggerIds);
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  }
  const queue = [...triggerIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const target of adjacency.get(current) ?? []) {
      if (!reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  return reachable;
}

function validateRunnability(
  nodes: FlowNode[],
  edges: FlowEdge[],
  modelPresets: ModelPreset[],
): string | null {
  if (nodes.length === 0) {
    return "Add a Trigger and at least one Agent before running.";
  }

  const triggers = nodes.filter((node) => node.data.kind === "trigger");
  if (triggers.length === 0) {
    return "Add a Trigger node to start the run.";
  }
  if (triggers.length > 1) {
    return "A workflow can only have one Trigger node right now.";
  }

  if (detectGraphCycle(nodes, edges)) {
    return "Remove the loop between connected nodes before running.";
  }

  const reachable = findReachableFromTriggers(nodes, edges);
  const orphan = nodes.find((node) => !reachable.has(node.id));
  if (orphan) {
    const label = orphan.data.title || orphan.id;
    return `Connect "${label}" to the Trigger so it can receive input.`;
  }

  for (const node of nodes) {
    if (node.data.kind === "agent") {
      if (!hasAvailableModelPreset(modelPresets, node.data.modelPresetId)) {
        const label = node.data.title || node.id;
        return `Pick an available model on "${label}" before running.`;
      }
      if (!node.data.systemPrompt?.trim()) {
        const label = node.data.title || node.id;
        return `Add a system prompt to "${label}" before running.`;
      }
    }
  }

  return null;
}

export const useFlowentWorkspaceStore = create<FlowentWorkspaceStore>()((
  set,
  get,
) => {
  const persistLocalData = () => {
    const state = get();

    if (!state.hasLoadedLocalData) {
      return;
    }

    set({
      localDataStatus: "saving",
      localDataMessage: localDataSaveMessage,
    });

    void saveLocalSettings(createLocalSettingsSnapshot(state))
      .then(() => {
        set({
          localDataStatus: "ready",
          localDataMessage: null,
        });
      })
      .catch((error) => {
        set({
          localDataStatus: "error",
          localDataMessage: getLocalDataErrorMessage(
            error,
            localDataSaveErrorMessage,
          ),
        });
      });
  };

  const commitLocalDataChange = async (
    createPatch: (state: WorkspaceState) => Partial<WorkspaceState>,
  ) => {
    const state = get();
    const patch = createPatch(state);
    const nextState = { ...state, ...patch };

    set({
      localDataStatus: "saving",
      localDataMessage: localDataSaveMessage,
    });

    try {
      await saveLocalSettings(createLocalSettingsSnapshot(nextState));
      set({
        ...patch,
        localDataStatus: "ready",
        localDataMessage: null,
        hasLoadedLocalData: true,
      });

      return true;
    } catch (error) {
      set({
        localDataStatus: "error",
        localDataMessage: getLocalDataErrorMessage(
          error,
          localDataSaveErrorMessage,
        ),
      });

      return false;
    }
  };

  const isRunning = () => get().workflowRunStatus === "running";

  return {
    blueprints: initialBlueprints.map(cloneBlueprint),
    activeBlueprintId: initialBlueprints[0]?.id ?? null,
    modelConnections: cloneModelConnections(initialModelConnections),
    modelPresets: cloneModelPresets(initialModelPresets),
    roles: cloneRoles(initialRoles),
    nodes: cloneNodes(initialBlueprints[0]?.nodes ?? []),
    edges: cloneEdges(initialBlueprints[0]?.edges ?? []),
    workflowRunStatus: "idle",
    runStartedAt: null,
    runBlockedReason: null,
    frozenRunGraph: null,
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: getNextNodeIndex(initialBlueprints[0]?.nodes ?? []),
    localDataStatus: "loading",
    localDataMessage: null,
    hasLoadedLocalData: false,

    loadLocalSettings: async () => {
      set({
        localDataStatus: "loading",
        localDataMessage: null,
      });

      try {
        const body = await readLocalSettings();

        if (body.saved && body.settings) {
          set(applyLocalSettingsSnapshot(body.settings));
          return;
        }

        set({
          localDataStatus: "ready",
          localDataMessage: null,
          hasLoadedLocalData: true,
        });
      } catch (error) {
        set({
          localDataStatus: "error",
          localDataMessage: getLocalDataErrorMessage(
            error,
            localDataLoadErrorMessage,
          ),
        });
      }
    },

    createBlueprint: (name) => {
      const id = makeId("blueprint");
      const blueprint: BlueprintAsset = {
        id,
        name: name?.trim() || "Untitled workflow",
        updatedAt: new Date().toISOString(),
        summary: "Blank workflow ready to build.",
        nodes: [],
        edges: [],
      };

      set((state) => ({
        blueprints: state.blueprints.concat(cloneBlueprint(blueprint)),
        activeBlueprintId: id,
        nodes: [],
        edges: [],
        workflowRunStatus: "idle",
        runStartedAt: null,
        runBlockedReason: null,
        frozenRunGraph: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        nextNodeIndex: 1,
      }));

      persistLocalData();

      return id;
    },

    openBlueprint: (blueprintId) => {
      let opened = false;

      set((state) => {
        const blueprint = state.blueprints.find(
          (item) => item.id === blueprintId,
        );

        if (!blueprint) {
          return state;
        }

        opened = true;

        const graph = resetRunState(
          cloneNodes(blueprint.nodes),
          cloneEdges(blueprint.edges),
        );
        const updatedAt = new Date().toISOString();
        const openedBlueprint = {
          ...blueprint,
          updatedAt,
          nodes: cloneNodes(graph.nodes),
          edges: cloneEdges(graph.edges),
        };
        const remainingBlueprints = state.blueprints.filter(
          (item) => item.id !== blueprintId,
        );

        return {
          blueprints: [openedBlueprint, ...remainingBlueprints],
          activeBlueprintId: blueprintId,
          nodes: graph.nodes,
          edges: graph.edges,
          workflowRunStatus: "idle",
          runStartedAt: null,
          runBlockedReason: null,
          frozenRunGraph: null,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          nextNodeIndex: getNextNodeIndex(graph.nodes),
        };
      });

      if (opened) {
        persistLocalData();
      }
    },

    setSelection: (nodeIds, edgeIds) =>
      set((state) => {
        const sameNodeIds = areSameIds(state.selectedNodeIds, nodeIds);
        const sameEdgeIds = areSameIds(state.selectedEdgeIds, edgeIds);

        if (sameNodeIds && sameEdgeIds) {
          return state;
        }

        return {
          selectedNodeIds: sameNodeIds ? state.selectedNodeIds : nodeIds,
          selectedEdgeIds: sameEdgeIds ? state.selectedEdgeIds : edgeIds,
        };
      }),

    applyNodeChanges: (changes) => {
      const running = isRunning();
      const allowedChanges = running
        ? changes.filter((change) => !isStructuralNodeChange(change))
        : changes;

      if (allowedChanges.length === 0) {
        return;
      }

      const shouldPersist = shouldPersistNodeChanges(allowedChanges);

      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const nodes = applyNodeChanges(
          allowedChanges.map(snapNodeChange),
          state.nodes,
        );

        return {
          nodes,
          blueprints: updateActiveBlueprint(state, nodes, state.edges),
        };
      });

      if (shouldPersist) {
        persistLocalData();
      }
    },

    applyEdgeChanges: (changes) => {
      const running = isRunning();
      const allowedChanges = running
        ? changes.filter((change) => !isStructuralEdgeChange(change))
        : changes;

      if (allowedChanges.length === 0) {
        return;
      }

      const shouldPersist = shouldPersistEdgeChanges(allowedChanges);

      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const edges = applyEdgeChanges(allowedChanges, state.edges);

        return {
          edges,
          blueprints: updateActiveBlueprint(state, state.nodes, edges),
        };
      });

      if (shouldPersist) {
        persistLocalData();
      }
    },

    connectNodes: (connection) => {
      if (isRunning() || !get().activeBlueprintId) {
        return;
      }

      if (!isValidConnection(connection)) {
        return;
      }

      set((state) => {
        const edges = addEdge(
          { ...connection, type: "smoothstep" },
          state.edges,
        );

        return {
          edges,
          blueprints: updateActiveBlueprint(state, state.nodes, edges),
        };
      });
      persistLocalData();
    },

    addWorkflowNode: (kind, position) => {
      if (isRunning()) {
        return;
      }

      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const id = `${kind}-${state.nextNodeIndex}`;
        const nodes = state.nodes.concat(createNode(kind, id, position));

        return {
          nodes,
          selectedNodeIds: [id],
          selectedEdgeIds: [],
          nextNodeIndex: state.nextNodeIndex + 1,
          blueprints: updateActiveBlueprint(state, nodes, state.edges),
        };
      });
      persistLocalData();
    },

    addQuickNode: (kind) => {
      if (isRunning() || !get().activeBlueprintId) {
        return;
      }

      const { addWorkflowNode, nextNodeIndex } = get();

      addWorkflowNode(kind, { x: 120 + nextNodeIndex * 40, y: 120 });
    },

    deleteSelection: () => {
      if (isRunning() || !get().activeBlueprintId) {
        return;
      }

      const { selectedNodeIds, selectedEdgeIds } = get();

      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
        return;
      }

      set((state) => {
        const nodes = state.nodes.filter(
          (node) => !selectedNodeIds.includes(node.id),
        );
        const edges = state.edges.filter(
          (edge) =>
            !selectedEdgeIds.includes(edge.id) &&
            !selectedNodeIds.includes(edge.source) &&
            !selectedNodeIds.includes(edge.target),
        );

        return {
          nodes,
          edges,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          blueprints: updateActiveBlueprint(state, nodes, edges),
        };
      });
      persistLocalData();
    },

    deleteConnectedEdges: (deletedNodes) => {
      if (isRunning()) {
        return;
      }

      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const edges = state.edges.filter(
          (edge) =>
            !getConnectedEdges(deletedNodes, state.edges).includes(edge),
        );

        return {
          edges,
          blueprints: updateActiveBlueprint(state, state.nodes, edges),
        };
      });
      persistLocalData();
    },

    updateNodeData: (nodeId, patch) => {
      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const nodes = state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        );

        return {
          nodes,
          blueprints: updateActiveBlueprint(state, nodes, state.edges),
        };
      });
      persistLocalData();
    },

    startWorkflowRun: () => {
      const state = get();
      if (state.workflowRunStatus === "running" || !state.activeBlueprintId) {
        return;
      }

      const blockedReason = validateRunnability(
        state.nodes,
        state.edges,
        state.modelPresets,
      );

      if (blockedReason) {
        set({ runBlockedReason: blockedReason });
        return;
      }

      const baseGraph = resetRunState(
        cloneNodes(state.nodes),
        cloneEdges(state.edges),
      );
      const triggerNode = baseGraph.nodes.find(
        (node) => node.data.kind === "trigger",
      );
      const initialRunningId = triggerNode
        ? baseGraph.edges.find((edge) => edge.source === triggerNode.id)?.target
        : undefined;
      const nodes = applyRunStatuses(
        baseGraph.nodes,
        baseGraph.edges,
        state.modelPresets,
        (node) =>
          node.data.kind === "trigger"
            ? "success"
            : node.id === initialRunningId
              ? "running"
              : "pending",
      );
      const edges = baseGraph.edges.map((edge) => ({
        ...edge,
        animated: true,
      }));
      const frozenRunGraph = {
        nodes: cloneNodes(nodes),
        edges: cloneEdges(baseGraph.edges),
        modelPresets: cloneFrozenModelPresets(state.modelPresets),
      };

      set({
        nodes: mergeRunStateIntoLiveNodes(baseGraph.nodes, nodes),
        edges,
        workflowRunStatus: "running",
        runStartedAt: new Date().toISOString(),
        runBlockedReason: null,
        frozenRunGraph,
      });
    },

    advanceWorkflowRun: () => {
      set((state) => {
        if (state.workflowRunStatus !== "running" || !state.frozenRunGraph) {
          return state;
        }

        const nodes = applyRunStatuses(
          state.frozenRunGraph.nodes,
          state.frozenRunGraph.edges,
          state.frozenRunGraph.modelPresets,
          (node) =>
            node.data.status === "running"
              ? "success"
              : node.data.status === "pending" &&
                  state
                    .frozenRunGraph!.edges.filter(
                      (edge) => edge.target === node.id,
                    )
                    .every((edge) =>
                      state.frozenRunGraph!.nodes.find(
                        (sourceNode) =>
                          sourceNode.id === edge.source &&
                          (sourceNode.data.status === "success" ||
                            sourceNode.data.status === "running"),
                      ),
                    )
                ? "running"
                : node.data.status,
        );

        return {
          nodes: mergeRunStateIntoLiveNodes(state.nodes, nodes),
          frozenRunGraph: {
            ...state.frozenRunGraph,
            nodes: cloneNodes(nodes),
          },
        };
      });
    },

    finishWorkflowRun: () => {
      set((state) => {
        if (state.workflowRunStatus !== "running" || !state.frozenRunGraph) {
          return state;
        }

        const nodes = applyRunStatuses(
          state.frozenRunGraph.nodes,
          state.frozenRunGraph.edges,
          state.frozenRunGraph.modelPresets,
          () => "success",
        );
        const edges = state.edges.map((edge) => ({ ...edge, animated: false }));

        return {
          nodes: mergeRunStateIntoLiveNodes(state.nodes, nodes),
          edges,
          workflowRunStatus: "succeeded",
          frozenRunGraph: null,
        };
      });
    },

    cancelWorkflowRun: () => {
      set((state) => {
        if (state.workflowRunStatus !== "running" || !state.frozenRunGraph) {
          return state;
        }

        const runNodes = cancelRunNodes(state.frozenRunGraph.nodes);
        const edges = state.edges.map((edge) => ({ ...edge, animated: false }));

        return {
          nodes: mergeRunStateIntoLiveNodes(state.nodes, runNodes),
          edges,
          workflowRunStatus: "canceled",
          frozenRunGraph: null,
        };
      });
    },

    upsertModelConnection: (modelConnection, editingId) =>
      commitLocalDataChange((state) => {
        if (editingId) {
          return {
            modelConnections: state.modelConnections.map((item) =>
              item.id === editingId
                ? {
                    ...item,
                    type: modelConnection.type,
                    name: modelConnection.name.trim(),
                    accessKey: modelConnection.accessKey || item.accessKey,
                    endpointUrl: modelConnection.endpointUrl.trim(),
                  }
                : item,
            ),
          };
        }

        return {
          modelConnections: state.modelConnections.concat({
            ...modelConnection,
            id: makeId("connection"),
            name: modelConnection.name.trim(),
            accessKey: modelConnection.accessKey.trim(),
            endpointUrl: modelConnection.endpointUrl.trim(),
          }),
        };
      }),

    deleteModelConnection: (modelConnectionId) =>
      commitLocalDataChange((state) => {
        const removedPresetIds = new Set(
          state.modelPresets
            .filter((preset) => preset.modelConnectionId === modelConnectionId)
            .map((preset) => preset.id),
        );

        return {
          modelConnections: state.modelConnections.filter(
            (modelConnection) => modelConnection.id !== modelConnectionId,
          ),
          modelPresets: state.modelPresets.filter(
            (preset) => !removedPresetIds.has(preset.id),
          ),
        };
      }),

    upsertModelPreset: (modelPreset, editingId) =>
      commitLocalDataChange((state) => {
        if (editingId) {
          return {
            modelPresets: state.modelPresets.map((preset) =>
              preset.id === editingId
                ? {
                    ...modelPreset,
                    id: editingId,
                    name: modelPreset.name.trim(),
                    modelName: modelPreset.modelName.trim(),
                    testStatus: "idle",
                    testMessage: undefined,
                  }
                : preset,
            ),
          };
        }

        return {
          modelPresets: state.modelPresets.concat({
            ...modelPreset,
            id: makeId("preset"),
            name: modelPreset.name.trim(),
            modelName: modelPreset.modelName.trim(),
            testStatus: "idle",
            testMessage: undefined,
          }),
        };
      }),

    deleteModelPreset: (presetId) =>
      commitLocalDataChange((state) => {
        const modelPresets = state.modelPresets.filter(
          (preset) => preset.id !== presetId,
        );

        return {
          modelPresets,
        };
      }),

    testModelPreset: (presetId) =>
      set((state) => ({
        modelPresets: state.modelPresets.map((preset) => {
          if (preset.id !== presetId) {
            return preset;
          }

          const modelConnection = state.modelConnections.find(
            (item) => item.id === preset.modelConnectionId,
          );
          const hasRequiredFields = Boolean(
            modelConnection?.accessKey && preset.modelName.trim(),
          );

          return {
            ...preset,
            testStatus: hasRequiredFields ? "success" : "error",
            testMessage: hasRequiredFields
              ? "Connection details are ready for testing."
              : "Add a saved access key and model name first.",
          };
        }),
      })),

    upsertRole: (role, editingId) => {
      set((state) => {
        if (editingId) {
          return {
            roles: state.roles.map((item) =>
              item.id === editingId
                ? {
                    ...role,
                    id: editingId,
                    name: role.name.trim(),
                    avatar: role.avatar.trim(),
                    systemPrompt: role.systemPrompt.trim(),
                  }
                : item,
            ),
          };
        }

        return {
          roles: state.roles.concat({
            ...role,
            id: makeId("role"),
            name: role.name.trim(),
            avatar: role.avatar.trim(),
            systemPrompt: role.systemPrompt.trim(),
          }),
        };
      });
      persistLocalData();
    },

    deleteRole: (roleId) => {
      set((state) => ({
        roles: state.roles.filter((role) => role.id !== roleId),
      }));
      persistLocalData();
    },

    addAgentFromRole: (roleId, position) => {
      if (isRunning()) {
        return;
      }

      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const role = state.roles.find((item) => item.id === roleId);

        if (
          !role ||
          !state.modelPresets.some((preset) => preset.id === role.modelPresetId)
        ) {
          return {};
        }

        const id = `agent-${state.nextNodeIndex}`;
        const node = createNode("agent", id, position);
        const nodes = state.nodes.concat({
          ...node,
          data: {
            ...node.data,
            title: role.name,
            name: role.name,
            avatar: role.avatar,
            systemPrompt: role.systemPrompt,
            modelPresetId: role.modelPresetId,
          },
        });

        return {
          nodes,
          selectedNodeIds: [id],
          selectedEdgeIds: [],
          nextNodeIndex: state.nextNodeIndex + 1,
          blueprints: updateActiveBlueprint(state, nodes, state.edges),
        };
      });
      persistLocalData();
    },
  };
});

export { isValidConnection, validateRunnability };
