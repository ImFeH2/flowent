import type { EdgeChange, NodeChange } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  canvasSnapGrid,
  initialEdges,
  initialModelPresets,
  initialNodes,
  initialProviders,
  initialRoles,
  snapCanvasPosition,
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

function expectGridPosition(position: FlowNode["position"]) {
  expect(position.x % canvasSnapGrid[0]).toBe(0);
  expect(position.y % canvasSnapGrid[1]).toBe(0);
}

describe("useFlowentWorkspaceStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts in blueprint mode", () => {
    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("blueprint");
  });

  it("starts with demo nodes aligned to the canvas grid", () => {
    for (const node of useFlowentWorkspaceStore.getState().nodes) {
      expectGridPosition(node.position);
    }
  });

  it("snaps newly added workflow nodes to the canvas grid", () => {
    useFlowentWorkspaceStore
      .getState()
      .addWorkflowNode("agent", { x: 13, y: 27 });

    const node = getNode("agent-3");

    expect(node.position).toEqual(snapCanvasPosition({ x: 13, y: 27 }));
    expect(useFlowentWorkspaceStore.getState().selectedNodeIds).toEqual([
      "agent-3",
    ]);
  });

  it("snaps quick-added nodes to the canvas grid", () => {
    useFlowentWorkspaceStore.getState().addQuickNode("trigger");

    expectGridPosition(getNode("trigger-3").position);
  });

  it("snaps agents created from roles to the canvas grid", () => {
    useFlowentWorkspaceStore
      .getState()
      .addAgentFromRole("role-product-copywriter", { x: 491, y: 267 });

    const node = getNode("agent-3");

    expect(node.position).toEqual(snapCanvasPosition({ x: 491, y: 267 }));
    expect(node.data.title).toBe("Product Copywriter");
  });

  it("keeps node movement smooth while dragging and snaps when dragging ends", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.applyNodeChanges([
      {
        id: "agent-1",
        type: "position",
        position: { x: 333, y: 47 },
        dragging: true,
      },
    ]);

    expect(getNode("agent-1").position).toEqual({ x: 333, y: 47 });

    store.applyNodeChanges([
      {
        id: "agent-1",
        type: "position",
        position: { x: 333, y: 47 },
        dragging: false,
      },
    ]);

    expect(getNode("agent-1").position).toEqual(
      snapCanvasPosition({ x: 333, y: 47 }),
    );
  });

  it("snaps non-dragging and multi-node position changes to the canvas grid", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.applyNodeChanges([
      {
        id: "agent-1",
        type: "position",
        position: { x: 351, y: 58 },
      },
      {
        id: "agent-2",
        type: "position",
        position: { x: 703, y: 186 },
      },
    ]);

    expect(getNode("agent-1").position).toEqual(
      snapCanvasPosition({ x: 351, y: 58 }),
    );
    expect(getNode("agent-2").position).toEqual(
      snapCanvasPosition({ x: 703, y: 186 }),
    );
  });

  it("moves into workflow mode when a run starts", () => {
    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();
    const agentDetails = getNode("agent-1").data.runDetails;

    expect(state.canvasMode).toBe("workflow");
    expect(getNode("trigger-1").data.status).toBe("success");
    expect(getNode("agent-1").data.status).toBe("running");
    expect(getNode("agent-2").data.status).toBe("pending");
    expect(getNode("trigger-1").data.runDetails?.kind).toBe("trigger");
    expect(agentDetails?.kind).toBe("agent");
    if (agentDetails?.kind !== "agent") {
      throw new Error("Missing agent run details");
    }
    expect(agentDetails.conversation.map((entry) => entry.role)).toEqual([
      "system",
      "user",
      "tool-calls",
      "assistant",
    ]);
    expect(getNode("agent-2").data.runDetails).toBeUndefined();
    expect(state.edges.every((edge) => edge.animated)).toBe(true);
  });

  it("returns to blueprint mode with run presentation cleared", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.returnToBlueprintMode();

    const state = useFlowentWorkspaceStore.getState();

    expect(state.canvasMode).toBe("blueprint");
    expect(state.nodes.every((node) => node.data.status === "idle")).toBe(true);
    expect(state.nodes.every((node) => !node.data.runDetails)).toBe(true);
    expect(state.edges.every((edge) => edge.animated === false)).toBe(true);

    store.advanceWorkflowRun();
    store.finishWorkflowRun();

    expect(
      useFlowentWorkspaceStore
        .getState()
        .nodes.every((node) => node.data.status === "idle"),
    ).toBe(true);
  });

  it("keeps agent run details current as the workflow advances", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.advanceWorkflowRun();

    const firstAgentDetails = getNode("agent-1").data.runDetails;
    const secondAgentDetails = getNode("agent-2").data.runDetails;

    expect(getNode("agent-1").data.status).toBe("success");
    expect(getNode("agent-2").data.status).toBe("running");
    expect(firstAgentDetails?.kind).toBe("agent");
    expect(secondAgentDetails?.kind).toBe("agent");
    if (
      firstAgentDetails?.kind !== "agent" ||
      secondAgentDetails?.kind !== "agent"
    ) {
      throw new Error("Missing agent run details");
    }
    expect(secondAgentDetails.inputPayload).toBe(
      firstAgentDetails.outputPayload,
    );
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
