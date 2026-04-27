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
};

type WorkspaceActions = {
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
  returnToBlueprintMode: () => void;
  upsertProvider: (provider: Provider, editingId: string | null) => void;
  deleteProvider: (providerId: string) => void;
  upsertModelPreset: (
    modelPreset: ModelPreset,
    editingId: string | null,
  ) => void;
  deleteModelPreset: (presetId: string) => void;
  testModelPreset: (presetId: string) => void;
  upsertRole: (role: Role, editingId: string | null) => void;
  deleteRole: (roleId: string) => void;
  addAgentFromRole: (roleId: string, position: FlowNode["position"]) => void;
};

export type FlowentWorkspaceStore = WorkspaceState & WorkspaceActions;

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

function cloneBlueprint(blueprint: BlueprintAsset): BlueprintAsset {
  return {
    ...blueprint,
    nodes: cloneNodes(blueprint.nodes),
    edges: cloneEdges(blueprint.edges),
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

function resetRunState(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: { ...node.data, status: "idle" as const, runDetails: undefined },
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

export const useFlowentWorkspaceStore = create<FlowentWorkspaceStore>()(
  (set, get) => ({
    blueprints: initialBlueprints.map(cloneBlueprint),
    activeBlueprintId: initialBlueprints[0]?.id ?? null,
    providers: initialProviders,
    modelPresets: initialModelPresets,
    roles: initialRoles,
    nodes: cloneNodes(initialBlueprints[0]?.nodes ?? []),
    edges: cloneEdges(initialBlueprints[0]?.edges ?? []),
    canvasMode: "blueprint",
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: getNextNodeIndex(initialBlueprints[0]?.nodes ?? []),

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

    applyNodeChanges: (changes) =>
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
      }),

    applyEdgeChanges: (changes) =>
      set((state) => {
        if (state.canvasMode === "workflow" || !state.activeBlueprintId) {
          return state;
        }

        const edges = applyEdgeChanges(changes, state.edges);

        return {
          edges,
          blueprints: updateActiveBlueprint(state, state.nodes, edges),
        };
      }),

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
    },

    addWorkflowNode: (kind, position) =>
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
      }),

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
    },

    deleteConnectedEdges: (deletedNodes) =>
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
      }),

    updateNodeData: (nodeId, patch) =>
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
      }),

    startWorkflowRun: () =>
      set((state) => {
        if (!state.activeBlueprintId) {
          return state;
        }

        const nodes = applyRunStatuses(
          state.nodes,
          state.edges,
          state.modelPresets,
          (node) =>
            node.data.kind === "trigger"
              ? "success"
              : node.id === "agent-1"
                ? "running"
                : "pending",
        );
        const edges = state.edges.map((edge) => ({ ...edge, animated: true }));

        return {
          canvasMode: "workflow",
          nodes,
          edges,
          blueprints: updateActiveBlueprint(state, nodes, edges, {
            lastRunStatus: "running",
          }),
        };
      }),

    advanceWorkflowRun: () =>
      set((state) => {
        if (state.canvasMode !== "workflow" || !state.activeBlueprintId) {
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

        return {
          nodes,
          blueprints: updateActiveBlueprint(state, nodes, state.edges, {
            lastRunStatus: "running",
          }),
        };
      }),

    finishWorkflowRun: () =>
      set((state) => {
        if (state.canvasMode !== "workflow" || !state.activeBlueprintId) {
          return state;
        }

        const nodes = applyRunStatuses(
          state.nodes,
          state.edges,
          state.modelPresets,
          () => "success",
        );
        const edges = state.edges.map((edge) => ({ ...edge, animated: false }));

        return {
          nodes,
          edges,
          blueprints: updateActiveBlueprint(state, nodes, edges, {
            lastRunStatus: "success",
          }),
        };
      }),

    returnToBlueprintMode: () =>
      set((state) => {
        const graph = resetRunState(state.nodes, state.edges);

        return {
          canvasMode: "blueprint",
          ...graph,
          blueprints: updateActiveBlueprint(state, graph.nodes, graph.edges),
        };
      }),

    upsertProvider: (provider, editingId) =>
      set((state) => {
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
      set((state) => ({
        providers: state.providers.filter(
          (provider) => provider.id !== providerId,
        ),
      })),

    upsertModelPreset: (modelPreset, editingId) =>
      set((state) => {
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
      set((state) => {
        const modelPresets = state.modelPresets.filter(
          (preset) => preset.id !== presetId,
        );
        const fallbackPresetId = modelPresets.at(0)?.id;

        const nodes = state.nodes.map((node) =>
          node.data.modelPresetId === presetId
            ? {
                ...node,
                data: { ...node.data, modelPresetId: fallbackPresetId },
              }
            : node,
        );

        return {
          modelPresets,
          nodes,
          roles: state.roles.map((role) =>
            role.modelPresetId === presetId
              ? { ...role, modelPresetId: fallbackPresetId ?? "" }
              : role,
          ),
          blueprints: updateActiveBlueprint(state, nodes, state.edges),
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

    upsertRole: (role, editingId) =>
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
      }),

    deleteRole: (roleId) =>
      set((state) => ({
        roles: state.roles.filter((role) => role.id !== roleId),
      })),

    addAgentFromRole: (roleId, position) =>
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
      }),
  }),
);

export { isValidConnection };
