import type { EdgeChange, NodeChange } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  initialEdges,
  initialModelPresets,
  initialNodes,
  initialProviders,
  initialRoles,
  type FlowEdge,
  type FlowNode,
} from "./model";
import { useFlowentWorkspaceStore } from "./workspace-store";

function resetStore() {
  useFlowentWorkspaceStore.setState({
    providers: initialProviders.map((provider) => ({ ...provider })),
    modelPresets: initialModelPresets.map((preset) => ({ ...preset })),
    roles: initialRoles.map((role) => ({ ...role })),
    nodes: initialNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: initialEdges.map((edge) => ({ ...edge })),
    canvasMode: "blueprint",
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: 3,
  });
}

function getNode(nodeId: string) {
  const node = useFlowentWorkspaceStore
    .getState()
    .nodes.find((item) => item.id === nodeId);

  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }

  return node;
}

describe("useFlowentWorkspaceStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts in blueprint mode", () => {
    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("blueprint");
  });

  it("moves into workflow mode when a run starts", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();

    expect(state.canvasMode).toBe("workflow");
    expect(getNode("trigger-1").data.status).toBe("success");
    expect(getNode("agent-1").data.status).toBe("running");
    expect(getNode("agent-2").data.status).toBe("pending");
    expect(state.edges.every((edge) => edge.animated)).toBe(true);
  });

  it("returns to blueprint mode with run presentation cleared", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.returnToBlueprintMode();

    const state = useFlowentWorkspaceStore.getState();

    expect(state.canvasMode).toBe("blueprint");
    expect(state.nodes.every((node) => node.data.status === "idle")).toBe(true);
    expect(state.edges.every((edge) => edge.animated === false)).toBe(true);

    store.advanceWorkflowRun();
    store.finishWorkflowRun();

    expect(
      useFlowentWorkspaceStore
        .getState()
        .nodes.every((node) => node.data.status === "idle"),
    ).toBe(true);
  });

  it("ignores topology and node configuration edits in workflow mode", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();

    const before = useFlowentWorkspaceStore.getState();
    const nodeChange: NodeChange<FlowNode> = {
      id: "agent-1",
      type: "position",
      position: { x: 999, y: 999 },
    };
    const edgeChange: EdgeChange<FlowEdge> = {
      id: "trigger-1-agent-1",
      type: "remove",
    };

    store.applyNodeChanges([nodeChange]);
    store.applyEdgeChanges([edgeChange]);
    store.connectNodes({
      source: "agent-2",
      target: "trigger-1",
      sourceHandle: "output",
      targetHandle: "input",
    });
    store.addWorkflowNode("agent", { x: 10, y: 20 });
    store.addQuickNode("trigger");
    store.deleteSelection();
    store.deleteConnectedEdges([getNode("trigger-1")]);
    store.updateNodeData("agent-1", { title: "Changed" });
    store.addAgentFromRole("role-product-copywriter", { x: 30, y: 40 });

    const after = useFlowentWorkspaceStore.getState();

    expect(after.nodes).toHaveLength(before.nodes.length);
    expect(after.edges).toHaveLength(before.edges.length);
    expect(getNode("agent-1").position).toEqual(before.nodes[1].position);
    expect(getNode("agent-1").data.title).toBe(before.nodes[1].data.title);
    expect(after.selectedNodeIds).toEqual(["agent-1"]);
  });
});
