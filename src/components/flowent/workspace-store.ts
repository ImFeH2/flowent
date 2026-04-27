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
  type FlowEdge,
  type FlowNode,
  type ModelPreset,
  type Provider,
  type WorkflowNodeData,
  type WorkflowNodeKind,
} from "./model";

type WorkspaceState = {
  providers: Provider[];
  modelPresets: ModelPreset[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  settingsOpen: boolean;
  nextNodeIndex: number;
};

type WorkspaceActions = {
  setSettingsOpen: (open: boolean) => void;
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
  upsertProvider: (provider: Provider, editingId: string | null) => void;
  deleteProvider: (providerId: string) => void;
  upsertModelPreset: (
    modelPreset: ModelPreset,
    editingId: string | null,
  ) => void;
  deleteModelPreset: (presetId: string) => void;
  testModelPreset: (presetId: string) => void;
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

export const useFlowentWorkspaceStore = create<FlowentWorkspaceStore>()(
  (set, get) => ({
    providers: initialProviders,
    modelPresets: initialModelPresets,
    nodes: initialNodes,
    edges: initialEdges,
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    settingsOpen: false,
    nextNodeIndex: 3,

    setSettingsOpen: (open) => set({ settingsOpen: open }),

    setSelection: (nodeIds, edgeIds) =>
      set((state) => ({
        selectedNodeIds: areSameIds(state.selectedNodeIds, nodeIds)
          ? state.selectedNodeIds
          : nodeIds,
        selectedEdgeIds: areSameIds(state.selectedEdgeIds, edgeIds)
          ? state.selectedEdgeIds
          : edgeIds,
      })),

    applyNodeChanges: (changes) =>
      set((state) => ({
        nodes: applyNodeChanges(changes, state.nodes),
      })),

    applyEdgeChanges: (changes) =>
      set((state) => ({
        edges: applyEdgeChanges(changes, state.edges),
      })),

    connectNodes: (connection) => {
      if (!isValidConnection(connection)) {
        return;
      }

      set((state) => ({
        edges: addEdge({ ...connection, type: "smoothstep" }, state.edges),
      }));
    },

    addWorkflowNode: (kind, position) =>
      set((state) => {
        const id = `${kind}-${state.nextNodeIndex}`;

        return {
          nodes: state.nodes.concat(createNode(kind, id, position)),
          selectedNodeIds: [id],
          selectedEdgeIds: [],
          nextNodeIndex: state.nextNodeIndex + 1,
        };
      }),

    addQuickNode: (kind) => {
      const { addWorkflowNode, nextNodeIndex } = get();

      addWorkflowNode(kind, { x: 120 + nextNodeIndex * 40, y: 120 });
    },

    deleteSelection: () => {
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
      set((state) => ({
        edges: state.edges.filter(
          (edge) =>
            !getConnectedEdges(deletedNodes, state.edges).includes(edge),
        ),
      })),

    updateNodeData: (nodeId, patch) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      })),

    startWorkflowRun: () =>
      set((state) => ({
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
      set((state) => ({
        nodes: state.nodes.map((node) => {
          if (node.id === "agent-1") {
            return { ...node, data: { ...node.data, status: "success" } };
          }

          if (node.data.kind === "agent") {
            return { ...node, data: { ...node.data, status: "running" } };
          }

          return node;
        }),
      })),

    finishWorkflowRun: () =>
      set((state) => ({
        nodes: state.nodes.map((node) => ({
          ...node,
          data: { ...node.data, status: "success" },
        })),
        edges: state.edges.map((edge) => ({ ...edge, animated: false })),
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
  }),
);

export { isValidConnection };
