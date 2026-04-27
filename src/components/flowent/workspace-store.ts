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
  initialModelPresets,
  initialProviders,
  initialRoles,
  snapCanvasPosition,
  availableTools,
  type BlueprintAsset,
  type CanvasMode,
  type FlowEdge,
  type FlowNode,
  type ModelPreset,
  type NodeRunDetails,
  type Provider,
  type Role,
  type RunStatus,
  type WorkflowNodeData,
  type WorkflowNodeKind,
  type WorkflowRun,
} from "./model";

type WorkspaceState = {
  blueprints: BlueprintAsset[];
  activeBlueprintId: string | null;
  providers: Provider[];
  modelPresets: ModelPreset[];
  roles: Role[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  canvasMode: CanvasMode;
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
  selectWorkflowRun: (runId: string) => void;
  returnToBlueprintMode: () => void;
  upsertProvider: (
    provider: Provider,
    editingId: string | null,
  ) => Promise<boolean>;
  deleteProvider: (providerId: string) => Promise<boolean>;
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
  providers: Provider[];
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

function cloneWorkflowRun(run: WorkflowRun): WorkflowRun {
  return {
    ...run,
    nodes: cloneNodes(run.nodes),
    edges: cloneEdges(run.edges),
  };
}

function cloneWorkflowRuns(runHistory: WorkflowRun[] | undefined) {
  return (runHistory ?? []).map(cloneWorkflowRun);
}

function cloneProviders(providers: Provider[]) {
  return providers.map((provider) => ({ ...provider }));
}

function cloneModelPresets(modelPresets: ModelPreset[]) {
  return modelPresets.map((preset) => ({
    ...preset,
    testStatus: "idle" as const,
    testMessage: undefined,
  }));
}

function cloneRoles(roles: Role[]) {
  return roles.map((role) => ({ ...role }));
}

function cloneBlueprint(blueprint: BlueprintAsset): BlueprintAsset {
  const graph = resetRunState(
    cloneNodes(blueprint.nodes),
    cloneEdges(blueprint.edges),
  );
  const runHistory = cloneWorkflowRuns(blueprint.runHistory);
  const selectedRunId =
    blueprint.selectedRunId &&
    runHistory.some((run) => run.id === blueprint.selectedRunId)
      ? blueprint.selectedRunId
      : null;

  return {
    ...blueprint,
    nodes: graph.nodes,
    edges: graph.edges,
    runHistory,
    selectedRunId,
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

function hasUnavailableAgentModelReference(
  nodes: FlowNode[],
  modelPresets: ModelPreset[],
) {
  return nodes.some(
    (node) =>
      node.data.kind === "agent" &&
      !hasAvailableModelPreset(modelPresets, node.data.modelPresetId),
  );
}

function createLocalSettingsSnapshot(
  state: WorkspaceState,
): LocalSettingsSnapshot {
  return {
    providers: cloneProviders(state.providers),
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
  let body: LocalSettingsResponse | null = null;

  try {
    body = (await response.json()) as LocalSettingsResponse;
  } catch {
    body = null;
  }

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
  const activeBlueprintId = blueprints.at(0)?.id ?? null;
  const activeBlueprint = blueprints.at(0);
  const graph = resetRunState(
    cloneNodes(activeBlueprint?.nodes ?? []),
    cloneEdges(activeBlueprint?.edges ?? []),
  );

  return {
    providers: cloneProviders(snapshot.providers),
    modelPresets: cloneModelPresets(snapshot.modelPresets),
    blueprints,
    activeBlueprintId,
    roles: cloneRoles(snapshot.roles),
    nodes: graph.nodes,
    edges: graph.edges,
    canvasMode: "blueprint",
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
  patch: Partial<
    Pick<BlueprintAsset, "lastRunStatus" | "name" | "summary" | "updatedAt">
  > = {},
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

function resetRunState(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: { ...node.data, status: "idle" as const, runDetails: undefined },
    })),
    edges: edges.map((edge) => ({ ...edge, animated: false })),
  };
}

function getSelectedNodeIdsForRun(
  selectedNodeIds: string[],
  nodes: FlowNode[],
) {
  return selectedNodeIds.filter((nodeId) =>
    nodes.some((node) => node.id === nodeId && node.data.runDetails),
  );
}

function getSelectedEdgeIdsForGraph(
  selectedEdgeIds: string[],
  edges: FlowEdge[],
) {
  return selectedEdgeIds.filter((edgeId) =>
    edges.some((edge) => edge.id === edgeId),
  );
}

function updateActiveBlueprintRun(
  state: WorkspaceState,
  run: WorkflowRun,
  lastRunStatus: BlueprintAsset["lastRunStatus"],
) {
  if (!state.activeBlueprintId) {
    return state.blueprints;
  }

  const updatedAt = new Date().toISOString();

  return state.blueprints.map((blueprint) =>
    blueprint.id === state.activeBlueprintId
      ? {
          ...blueprint,
          updatedAt,
          lastRunStatus,
          selectedRunId: run.id,
          runHistory: blueprint.runHistory.map((item) =>
            item.id === run.id ? cloneWorkflowRun(run) : item,
          ),
        }
      : blueprint,
  );
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
  status: Exclude<RunStatus, "idle" | "pending">,
  nodes: FlowNode[],
  edges: FlowEdge[],
  modelPresets: ModelPreset[],
): NodeRunDetails {
  if (node.data.kind === "trigger") {
    const payload = node.data.initialPayload?.trim() || "No initial payload.";

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
    modelId: preset?.modelId,
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
    status === "idle" || status === "pending"
      ? undefined
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

  return {
    blueprints: initialBlueprints.map(cloneBlueprint),
    activeBlueprintId: initialBlueprints[0]?.id ?? null,
    providers: cloneProviders(initialProviders),
    modelPresets: cloneModelPresets(initialModelPresets),
    roles: cloneRoles(initialRoles),
    nodes: cloneNodes(initialBlueprints[0]?.nodes ?? []),
    edges: cloneEdges(initialBlueprints[0]?.edges ?? []),
    canvasMode: "blueprint",
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
        name: name?.trim() || "Untitled blueprint",
        updatedAt: new Date().toISOString(),
        lastRunStatus: "not-run",
        summary: "Blank blueprint ready to build.",
        nodes: [],
        edges: [],
        runHistory: [],
        selectedRunId: null,
      };

      set((state) => ({
        blueprints: state.blueprints.concat(cloneBlueprint(blueprint)),
        activeBlueprintId: id,
        nodes: [],
        edges: [],
        canvasMode: "blueprint",
        selectedNodeIds: [],
        selectedEdgeIds: [],
        nextNodeIndex: 1,
      }));

      persistLocalData();

      return id;
    },

    openBlueprint: (blueprintId) =>
      set((state) => {
        const blueprint = state.blueprints.find(
          (item) => item.id === blueprintId,
        );

        if (!blueprint) {
          return state;
        }

        const graph = resetRunState(
          cloneNodes(blueprint.nodes),
          cloneEdges(blueprint.edges),
        );

        return {
          blueprints: state.blueprints.map((item) =>
            item.id === blueprintId
              ? {
                  ...item,
                  nodes: cloneNodes(graph.nodes),
                  edges: cloneEdges(graph.edges),
                }
              : item,
          ),
          activeBlueprintId: blueprintId,
          nodes: graph.nodes,
          edges: graph.edges,
          canvasMode: "blueprint",
          selectedNodeIds: [],
          selectedEdgeIds: [],
          nextNodeIndex: getNextNodeIndex(graph.nodes),
        };
      }),

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
      const shouldPersist = shouldPersistNodeChanges(changes);

      set((state) => {
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
          return state;
        }

        const nodes = applyNodeChanges(
          changes.map(snapNodeChange),
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
      const shouldPersist = shouldPersistEdgeChanges(changes);

      set((state) => {
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
          return state;
        }

        const edges = applyEdgeChanges(changes, state.edges);

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
      if (get().canvasMode === "workflow" || !get().activeBlueprintId) {
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
      set((state) => {
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
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
      if (get().canvasMode === "workflow" || !get().activeBlueprintId) {
        return;
      }

      const { addWorkflowNode, nextNodeIndex } = get();

      addWorkflowNode(kind, { x: 120 + nextNodeIndex * 40, y: 120 });
    },

    deleteSelection: () => {
      if (get().canvasMode === "workflow" || !get().activeBlueprintId) {
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
      set((state) => {
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
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
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
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
      set((state) => {
        const activeBlueprint = state.blueprints.find(
          (blueprint) => blueprint.id === state.activeBlueprintId,
        );

        if (
          !state.activeBlueprintId ||
          !activeBlueprint ||
          hasUnavailableAgentModelReference(
            activeBlueprint.nodes,
            state.modelPresets,
          )
        ) {
          return state;
        }

        const baseGraph = resetRunState(
          cloneNodes(activeBlueprint.nodes),
          cloneEdges(activeBlueprint.edges),
        );
        const nodes = applyRunStatuses(
          baseGraph.nodes,
          baseGraph.edges,
          state.modelPresets,
          (node) =>
            node.data.kind === "trigger"
              ? "success"
              : node.id === "agent-1"
                ? "running"
                : "pending",
        );
        const edges = baseGraph.edges.map((edge) => ({
          ...edge,
          animated: true,
        }));
        const now = new Date().toISOString();
        const run: WorkflowRun = {
          id: makeId("run"),
          startedAt: now,
          updatedAt: now,
          status: "running",
          summary: "Run started.",
          nodes: cloneNodes(nodes),
          edges: cloneEdges(edges),
        };

        return {
          canvasMode: "workflow",
          nodes,
          edges,
          selectedNodeIds: getSelectedNodeIdsForRun(
            state.selectedNodeIds,
            nodes,
          ),
          selectedEdgeIds: getSelectedEdgeIdsForGraph(
            state.selectedEdgeIds,
            edges,
          ),
          blueprints: state.blueprints.map((blueprint) =>
            blueprint.id === state.activeBlueprintId
              ? {
                  ...blueprint,
                  updatedAt: now,
                  lastRunStatus: "running",
                  selectedRunId: run.id,
                  runHistory: [run, ...cloneWorkflowRuns(blueprint.runHistory)],
                }
              : blueprint,
          ),
        };
      });
      persistLocalData();
    },

    advanceWorkflowRun: () => {
      set((state) => {
        if (state.canvasMode !== "workflow" || !state.activeBlueprintId) {
          return state;
        }

        const activeBlueprint = state.blueprints.find(
          (blueprint) => blueprint.id === state.activeBlueprintId,
        );
        const selectedRun = activeBlueprint?.runHistory.find(
          (run) => run.id === activeBlueprint.selectedRunId,
        );

        if (!selectedRun || selectedRun.status !== "running") {
          return state;
        }

        const nodes = applyRunStatuses(
          state.nodes,
          state.edges,
          state.modelPresets,
          (node) =>
            node.id === "agent-1"
              ? "success"
              : node.data.kind === "agent"
                ? "running"
                : node.data.status,
        );
        const run: WorkflowRun = {
          ...selectedRun,
          updatedAt: new Date().toISOString(),
          status: "running",
          summary: "Run in progress.",
          nodes: cloneNodes(nodes),
          edges: cloneEdges(state.edges),
        };

        return {
          nodes,
          blueprints: updateActiveBlueprintRun(state, run, "running"),
        };
      });
      persistLocalData();
    },

    finishWorkflowRun: () => {
      set((state) => {
        if (state.canvasMode !== "workflow" || !state.activeBlueprintId) {
          return state;
        }

        const activeBlueprint = state.blueprints.find(
          (blueprint) => blueprint.id === state.activeBlueprintId,
        );
        const selectedRun = activeBlueprint?.runHistory.find(
          (run) => run.id === activeBlueprint.selectedRunId,
        );

        if (!selectedRun || selectedRun.status !== "running") {
          return state;
        }

        const nodes = applyRunStatuses(
          state.nodes,
          state.edges,
          state.modelPresets,
          () => "success",
        );
        const edges = state.edges.map((edge) => ({ ...edge, animated: false }));
        const run: WorkflowRun = {
          ...selectedRun,
          updatedAt: new Date().toISOString(),
          status: "success",
          summary: "Run completed.",
          nodes: cloneNodes(nodes),
          edges: cloneEdges(edges),
        };

        return {
          nodes,
          edges,
          blueprints: updateActiveBlueprintRun(state, run, "success"),
        };
      });
      persistLocalData();
    },

    selectWorkflowRun: (runId) => {
      set((state) => {
        const activeBlueprint = state.blueprints.find(
          (blueprint) => blueprint.id === state.activeBlueprintId,
        );
        const selectedRun = activeBlueprint?.runHistory.find(
          (run) => run.id === runId,
        );

        if (!activeBlueprint || !selectedRun) {
          return state;
        }

        const nodes = cloneNodes(selectedRun.nodes);
        const edges = cloneEdges(selectedRun.edges);

        return {
          canvasMode: "workflow",
          nodes,
          edges,
          selectedNodeIds: getSelectedNodeIdsForRun(
            state.selectedNodeIds,
            nodes,
          ),
          selectedEdgeIds: getSelectedEdgeIdsForGraph(
            state.selectedEdgeIds,
            edges,
          ),
          blueprints: state.blueprints.map((blueprint) =>
            blueprint.id === state.activeBlueprintId
              ? {
                  ...blueprint,
                  selectedRunId: runId,
                }
              : blueprint,
          ),
        };
      });
      persistLocalData();
    },

    returnToBlueprintMode: () =>
      set((state) => {
        const activeBlueprint = state.blueprints.find(
          (blueprint) => blueprint.id === state.activeBlueprintId,
        );

        if (!activeBlueprint) {
          return {
            canvasMode: "blueprint",
            nodes: [],
            edges: [],
            selectedNodeIds: [],
            selectedEdgeIds: [],
            nextNodeIndex: 1,
          };
        }

        const graph = resetRunState(
          cloneNodes(activeBlueprint.nodes),
          cloneEdges(activeBlueprint.edges),
        );

        return {
          canvasMode: "blueprint",
          ...graph,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          nextNodeIndex: getNextNodeIndex(graph.nodes),
        };
      }),

    upsertProvider: (provider, editingId) =>
      commitLocalDataChange((state) => {
        if (editingId) {
          return {
            providers: state.providers.map((item) =>
              item.id === editingId
                ? {
                    ...item,
                    type: provider.type,
                    name: provider.name.trim(),
                    apiKey: provider.apiKey || item.apiKey,
                    baseUrl: provider.baseUrl.trim(),
                  }
                : item,
            ),
          };
        }

        return {
          providers: state.providers.concat({
            ...provider,
            id: makeId("provider"),
            name: provider.name.trim(),
            apiKey: provider.apiKey.trim(),
            baseUrl: provider.baseUrl.trim(),
          }),
        };
      }),

    deleteProvider: (providerId) =>
      commitLocalDataChange((state) => {
        const removedPresetIds = new Set(
          state.modelPresets
            .filter((preset) => preset.providerId === providerId)
            .map((preset) => preset.id),
        );

        return {
          providers: state.providers.filter(
            (provider) => provider.id !== providerId,
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
                    modelId: modelPreset.modelId.trim(),
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
            modelId: modelPreset.modelId.trim(),
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

          const provider = state.providers.find(
            (item) => item.id === preset.providerId,
          );
          const hasRequiredFields = Boolean(
            provider?.apiKey && preset.modelId.trim(),
          );

          return {
            ...preset,
            testStatus: hasRequiredFields ? "success" : "error",
            testMessage: hasRequiredFields
              ? "Saved provider fields are ready for connection testing."
              : "Add a saved provider key and model ID first.",
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
      set((state) => {
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
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

export { isValidConnection };
