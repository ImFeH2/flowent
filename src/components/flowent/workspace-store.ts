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
  initialEdges,
  initialModelPresets,
  initialNodes,
  initialProviders,
  initialRoles,
  type CanvasMode,
  type FlowEdge,
  type FlowNode,
  type ModelPreset,
  type Provider,
  type Role,
  type WorkflowNodeData,
  type WorkflowNodeKind,
} from "./model";

type WorkspaceState = {
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

function isValidConnection(connection: Connection | Edge) {
  return (
    connection.source !== connection.target &&
    connection.sourceHandle === "output" &&
    connection.targetHandle === "input"
  );
}

function resetRunState(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      data: { ...node.data, status: "idle" as const },
    })),
    edges: edges.map((edge) => ({ ...edge, animated: false })),
  };
}

export const useFlowentWorkspaceStore = create<FlowentWorkspaceStore>()(
  (set, get) => ({
    providers: initialProviders,
    modelPresets: initialModelPresets,
    roles: initialRoles,
    nodes: initialNodes,
    edges: initialEdges,
    canvasMode: "blueprint",
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: 3,

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
        if (state.canvasMode === "workflow") {
          return state;
        }

        return {
          nodes: applyNodeChanges(changes, state.nodes),
        };
      }),

    applyEdgeChanges: (changes) =>
      set((state) => {
        if (state.canvasMode === "workflow") {
          return state;
        }

        return {
          edges: applyEdgeChanges(changes, state.edges),
        };
      }),

    connectNodes: (connection) => {
      if (get().canvasMode === "workflow") {
        return;
      }

      if (!isValidConnection(connection)) {
        return;
      }

      set((state) => ({
        edges: addEdge({ ...connection, type: "smoothstep" }, state.edges),
      }));
    },

    addWorkflowNode: (kind, position) =>
      set((state) => {
        if (state.canvasMode === "workflow") {
          return state;
        }

        const id = `${kind}-${state.nextNodeIndex}`;

        return {
          nodes: state.nodes.concat(createNode(kind, id, position)),
          selectedNodeIds: [id],
          selectedEdgeIds: [],
          nextNodeIndex: state.nextNodeIndex + 1,
        };
      }),

    addQuickNode: (kind) => {
      if (get().canvasMode === "workflow") {
        return;
      }

      const { addWorkflowNode, nextNodeIndex } = get();

      addWorkflowNode(kind, { x: 120 + nextNodeIndex * 40, y: 120 });
    },

    deleteSelection: () => {
      if (get().canvasMode === "workflow") {
        return;
      }

      const { selectedNodeIds, selectedEdgeIds } = get();

      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
        return;
      }

      set((state) => ({
        nodes: state.nodes.filter((node) => !selectedNodeIds.includes(node.id)),
        edges: state.edges.filter(
          (edge) =>
            !selectedEdgeIds.includes(edge.id) &&
            !selectedNodeIds.includes(edge.source) &&
            !selectedNodeIds.includes(edge.target),
        ),
        selectedNodeIds: [],
        selectedEdgeIds: [],
      }));
    },

    deleteConnectedEdges: (deletedNodes) =>
      set((state) => {
        if (state.canvasMode === "workflow") {
          return state;
        }

        return {
          edges: state.edges.filter(
            (edge) =>
              !getConnectedEdges(deletedNodes, state.edges).includes(edge),
          ),
        };
      }),

    updateNodeData: (nodeId, patch) =>
      set((state) => {
        if (state.canvasMode === "workflow") {
          return state;
        }

        return {
          nodes: state.nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...patch } }
              : node,
          ),
        };
      }),

    startWorkflowRun: () =>
      set((state) => ({
        canvasMode: "workflow",
        nodes: state.nodes.map((node) => {
          if (node.data.kind === "trigger") {
            return { ...node, data: { ...node.data, status: "success" } };
          }

          return {
            ...node,
            data: {
              ...node.data,
              status: node.id === "agent-1" ? "running" : "pending",
            },
          };
        }),
        edges: state.edges.map((edge) => ({ ...edge, animated: true })),
      })),

    advanceWorkflowRun: () =>
      set((state) => {
        if (state.canvasMode !== "workflow") {
          return state;
        }

        return {
          nodes: state.nodes.map((node) => {
            if (node.id === "agent-1") {
              return { ...node, data: { ...node.data, status: "success" } };
            }

            if (node.data.kind === "agent") {
              return { ...node, data: { ...node.data, status: "running" } };
            }

            return node;
          }),
        };
      }),

    finishWorkflowRun: () =>
      set((state) => {
        if (state.canvasMode !== "workflow") {
          return state;
        }

        return {
          nodes: state.nodes.map((node) => ({
            ...node,
            data: { ...node.data, status: "success" },
          })),
          edges: state.edges.map((edge) => ({ ...edge, animated: false })),
        };
      }),

    returnToBlueprintMode: () =>
      set((state) => ({
        canvasMode: "blueprint",
        ...resetRunState(state.nodes, state.edges),
      })),

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

        return {
          modelPresets,
          nodes: state.nodes.map((node) =>
            node.data.modelPresetId === presetId
              ? {
                  ...node,
                  data: { ...node.data, modelPresetId: fallbackPresetId },
                }
              : node,
          ),
          roles: state.roles.map((role) =>
            role.modelPresetId === presetId
              ? { ...role, modelPresetId: fallbackPresetId ?? "" }
              : role,
          ),
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
        if (state.canvasMode === "workflow") {
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

        return {
          nodes: state.nodes.concat({
            ...node,
            data: {
              ...node.data,
              title: role.name,
              name: role.name,
              avatar: role.avatar,
              systemPrompt: role.systemPrompt,
              modelPresetId: role.modelPresetId,
            },
          }),
          selectedNodeIds: [id],
          selectedEdgeIds: [],
          nextNodeIndex: state.nextNodeIndex + 1,
        };
      }),
  }),
);

export { isValidConnection };
