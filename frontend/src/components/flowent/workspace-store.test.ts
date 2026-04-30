import type { EdgeChange, NodeChange } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canvasSnapGrid,
  initialBlueprints,
  initialEdges,
  initialModelConnections,
  initialModelPresets,
  initialNodes,
  initialRoles,
  snapCanvasPosition,
  type FlowEdge,
  type FlowNode,
} from "./model";
import { useFlowentWorkspaceStore } from "./workspace-store";

function cloneNodes(nodes: FlowNode[]) {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: {
      ...node.data,
      tools: node.data.tools ? [...node.data.tools] : node.data.tools,
    },
  }));
}

function cloneEdges(edges: FlowEdge[]) {
  return edges.map((edge) => ({ ...edge }));
}

function resetStore() {
  useFlowentWorkspaceStore.setState({
    blueprints: initialBlueprints.map((blueprint) => ({
      ...blueprint,
      nodes: cloneNodes(blueprint.nodes),
      edges: cloneEdges(blueprint.edges),
    })),
    activeBlueprintId: initialBlueprints[0]?.id ?? null,
    modelConnections: initialModelConnections.map((connection) => ({
      ...connection,
    })),
    modelPresets: initialModelPresets.map((preset) => ({ ...preset })),
    roles: initialRoles.map((role) => ({ ...role })),
    nodes: cloneNodes(initialNodes),
    edges: cloneEdges(initialEdges),
    canvasMode: "blueprint",
    selectedNodeIds: ["agent-1"],
    selectedEdgeIds: [],
    nextNodeIndex: 3,
    localDataStatus: "ready",
    localDataMessage: null,
    hasLoadedLocalData: false,
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

function getActiveBlueprint() {
  const state = useFlowentWorkspaceStore.getState();
  const blueprint = state.blueprints.find(
    (item) => item.id === state.activeBlueprintId,
  );

  if (!blueprint) {
    throw new Error("Missing active blueprint");
  }

  return blueprint;
}

function expectGridPosition(position: FlowNode["position"]) {
  expect(position.x % canvasSnapGrid[0]).toBe(0);
  expect(position.y % canvasSnapGrid[1]).toBe(0);
}

function mockSuccessfulSettingsSave() {
  vi.stubGlobal(
    "fetch",
    vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      return Promise.resolve(
        new Response(
          JSON.stringify({ saved: true, settings: body?.settings }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }),
  );
}

describe("useFlowentWorkspaceStore", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    resetStore();
  });

  it("starts in blueprint mode", () => {
    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("blueprint");
  });

  it("starts with a workspace blueprint asset selected", () => {
    const state = useFlowentWorkspaceStore.getState();

    expect(state.blueprints).toHaveLength(1);
    expect(state.activeBlueprintId).toBe("blueprint-launch-campaign");
    expect(state.blueprints[0]).toMatchObject({
      name: "Launch Campaign",
      lastRunStatus: "not-run",
    });
    expect(state.nodes).toHaveLength(initialNodes.length);
    expect(state.edges).toHaveLength(initialEdges.length);
  });

  it("loads saved local settings into the workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              saved: true,
              settings: {
                modelConnections: [
                  {
                    id: "connection-saved",
                    type: "gemini",
                    name: "Saved Gateway",
                    accessKey: "saved-key",
                    endpointUrl: "http://localhost:4400/v1",
                  },
                ],
                modelPresets: [
                  {
                    id: "preset-saved",
                    name: "Saved Model",
                    modelConnectionId: "connection-saved",
                    modelName: "gemini-2.5-pro",
                    temperature: 0.4,
                    outputLimit: 900,
                  },
                ],
                blueprints: [
                  {
                    ...initialBlueprints[0],
                    id: "blueprint-saved",
                    name: "Saved Blueprint",
                  },
                ],
                roles: [
                  {
                    id: "role-saved",
                    name: "Saved Role",
                    avatar: "SR",
                    systemPrompt: "Use the saved model.",
                    modelPresetId: "preset-saved",
                  },
                ],
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );

    await useFlowentWorkspaceStore.getState().loadLocalSettings();

    const state = useFlowentWorkspaceStore.getState();

    expect(state.localDataStatus).toBe("ready");
    expect(state.modelConnections[0]?.name).toBe("Saved Gateway");
    expect(state.modelPresets[0]?.name).toBe("Saved Model");
    expect(state.blueprints[0]?.name).toBe("Saved Blueprint");
    expect(state.activeBlueprintId).toBe("blueprint-saved");
    expect(state.roles[0]?.name).toBe("Saved Role");
    expect(state.blueprints[0]?.runHistory).toEqual([]);
    expect(state.blueprints[0]?.selectedRunId).toBeNull();
    expect(state.canvasMode).toBe("blueprint");
  });

  it("loads saved run instances while returning to edit mode", async () => {
    const savedRun = {
      id: "run-saved",
      startedAt: "2026-04-27T10:00:00.000Z",
      updatedAt: "2026-04-27T10:01:00.000Z",
      status: "succeeded",
      summary: "Saved run completed.",
      nodes: cloneNodes(initialNodes).map((node) => ({
        ...node,
        data: { ...node.data, status: "success" as const },
      })),
      edges: cloneEdges(initialEdges).map((edge) => ({
        ...edge,
        animated: false,
      })),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              saved: true,
              settings: {
                modelConnections: initialModelConnections,
                modelPresets: initialModelPresets,
                blueprints: [
                  {
                    ...initialBlueprints[0],
                    runHistory: [savedRun],
                    selectedRunId: savedRun.id,
                  },
                ],
                roles: initialRoles,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );

    await useFlowentWorkspaceStore.getState().loadLocalSettings();

    const state = useFlowentWorkspaceStore.getState();
    const activeBlueprint = getActiveBlueprint();

    expect(state.canvasMode).toBe("blueprint");
    expect(state.nodes.every((node) => node.data.status === "idle")).toBe(true);
    expect(activeBlueprint.runHistory).toEqual([savedRun]);
    expect(activeBlueprint.selectedRunId).toBe(savedRun.id);
  });

  it("saves run instances and the selected run with local settings", () => {
    const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      return Promise.resolve(
        new Response(JSON.stringify({ saved: true, settings: body.settings }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);
    useFlowentWorkspaceStore.setState({ hasLoadedLocalData: true });

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const savedBlueprint = body.settings.blueprints.find(
      (blueprint: { id: string }) => blueprint.id === getActiveBlueprint().id,
    );

    expect(savedBlueprint.runHistory).toHaveLength(1);
    expect(savedBlueprint.selectedRunId).toBe(savedBlueprint.runHistory[0].id);
    expect(savedBlueprint.runHistory[0]).toMatchObject({
      status: "running",
      summary: "Run started.",
    });
  });

  it("keeps settings unchanged when a local save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: "Settings could not be saved." }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );

    const saved = await useFlowentWorkspaceStore
      .getState()
      .upsertModelConnection(
        {
          id: "",
          type: "openai-responses",
          name: "Unsaved Gateway",
          accessKey: "new-key",
          endpointUrl: "http://localhost:4500/v1",
        },
        null,
      );

    const state = useFlowentWorkspaceStore.getState();

    expect(saved).toBe(false);
    expect(
      state.modelConnections.some(
        (connection) => connection.name === "Unsaved Gateway",
      ),
    ).toBe(false);
    expect(state.localDataStatus).toBe("error");
    expect(state.localDataMessage).toBe("Settings could not be saved.");
  });

  it("keeps the saved access key when editing a connection with a blank key", async () => {
    mockSuccessfulSettingsSave();

    const saved = await useFlowentWorkspaceStore
      .getState()
      .upsertModelConnection(
        {
          id: "connection-work-gateway",
          type: "openai-responses",
          name: "Updated gateway",
          accessKey: "",
          endpointUrl: " http://localhost:4500/v1 ",
        },
        "connection-work-gateway",
      );

    const connection = useFlowentWorkspaceStore
      .getState()
      .modelConnections.find((item) => item.id === "connection-work-gateway");

    expect(saved).toBe(true);
    expect(connection).toMatchObject({
      type: "openai-responses",
      name: "Updated gateway",
      accessKey: "saved-demo-key",
      endpointUrl: "http://localhost:4500/v1",
    });
  });

  it("removes presets that depend on a deleted connection", async () => {
    mockSuccessfulSettingsSave();

    const saved = await useFlowentWorkspaceStore
      .getState()
      .deleteModelConnection("connection-work-gateway");

    const state = useFlowentWorkspaceStore.getState();

    expect(saved).toBe(true);
    expect(
      state.modelConnections.some(
        (connection) => connection.id === "connection-work-gateway",
      ),
    ).toBe(false);
    expect(
      state.modelPresets.some((preset) => preset.id === "preset-writing"),
    ).toBe(false);
    expect(
      state.modelPresets.some(
        (preset) => preset.modelConnectionId === "connection-work-gateway",
      ),
    ).toBe(false);
  });

  it("tests model presets against saved connection details", () => {
    useFlowentWorkspaceStore.getState().testModelPreset("preset-writing");

    expect(
      useFlowentWorkspaceStore
        .getState()
        .modelPresets.find((preset) => preset.id === "preset-writing"),
    ).toMatchObject({
      testStatus: "success",
      testMessage: "Connection details are ready for testing.",
    });

    useFlowentWorkspaceStore.setState({
      modelConnections: useFlowentWorkspaceStore
        .getState()
        .modelConnections.map((connection) =>
          connection.id === "connection-work-gateway"
            ? { ...connection, accessKey: "" }
            : connection,
        ),
    });

    useFlowentWorkspaceStore.getState().testModelPreset("preset-writing");

    expect(
      useFlowentWorkspaceStore
        .getState()
        .modelPresets.find((preset) => preset.id === "preset-writing"),
    ).toMatchObject({
      testStatus: "error",
      testMessage: "Add a saved access key and model name first.",
    });
  });

  it("creates a blank workflow and makes it current", () => {
    const id = useFlowentWorkspaceStore
      .getState()
      .createBlueprint("Audience Follow-up");

    const state = useFlowentWorkspaceStore.getState();

    expect(state.activeBlueprintId).toBe(id);
    expect(
      state.blueprints.find((blueprint) => blueprint.id === id),
    ).toMatchObject({
      name: "Audience Follow-up",
      lastRunStatus: "not-run",
      summary: "Blank workflow ready to build.",
    });
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.canvasMode).toBe("blueprint");
  });

  it("opens a blueprint and loads its saved graph", () => {
    const store = useFlowentWorkspaceStore.getState();
    const createdId = store.createBlueprint("Blank Draft");

    useFlowentWorkspaceStore.getState().addQuickNode("trigger");
    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(1);

    useFlowentWorkspaceStore
      .getState()
      .openBlueprint("blueprint-launch-campaign");

    expect(useFlowentWorkspaceStore.getState().activeBlueprintId).toBe(
      "blueprint-launch-campaign",
    );
    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(
      initialNodes.length,
    );

    useFlowentWorkspaceStore.getState().openBlueprint(createdId);

    expect(useFlowentWorkspaceStore.getState().activeBlueprintId).toBe(
      createdId,
    );
    expect(useFlowentWorkspaceStore.getState().nodes).toHaveLength(1);
    expect(useFlowentWorkspaceStore.getState().selectedNodeIds).toEqual([]);
  });

  it("marks an opened blueprint as the most recent workflow", () => {
    vi.useFakeTimers();

    try {
      const store = useFlowentWorkspaceStore.getState();

      vi.setSystemTime(new Date("2026-04-29T10:00:00.000Z"));
      store.createBlueprint("Follow-up Draft");

      vi.setSystemTime(new Date("2026-04-29T10:05:00.000Z"));
      store.openBlueprint("blueprint-launch-campaign");

      const state = useFlowentWorkspaceStore.getState();

      expect(state.blueprints[0]).toMatchObject({
        id: "blueprint-launch-campaign",
        updatedAt: "2026-04-29T10:05:00.000Z",
      });
      expect(state.activeBlueprintId).toBe("blueprint-launch-campaign");
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens workflow history items in editable mode from run details", () => {
    const store = useFlowentWorkspaceStore.getState();
    const firstBlueprintId = getActiveBlueprint().id;
    const secondBlueprintId = store.createBlueprint("Second Blueprint");

    store.addQuickNode("trigger");
    store.openBlueprint(firstBlueprintId);
    store.startWorkflowRun();
    store.finishWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("workflow");
    expect(
      useFlowentWorkspaceStore
        .getState()
        .nodes.every((node) => node.data.status === "success"),
    ).toBe(true);

    store.openBlueprint(secondBlueprintId);

    const state = useFlowentWorkspaceStore.getState();
    const activeBlueprint = getActiveBlueprint();

    expect(state.activeBlueprintId).toBe(secondBlueprintId);
    expect(state.canvasMode).toBe("blueprint");
    expect(state.blueprints[0]?.id).toBe(secondBlueprintId);
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes).toEqual(activeBlueprint.nodes);
    expect(state.nodes.every((node) => node.data.status === "idle")).toBe(true);
    expect(state.nodes.every((node) => !node.data.runDetails)).toBe(true);
    expect(state.edges.every((edge) => edge.animated === false)).toBe(true);
  });

  it("ignores graph edits and runs when no blueprint is current", () => {
    useFlowentWorkspaceStore.setState({
      activeBlueprintId: null,
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      nextNodeIndex: 1,
      canvasMode: "blueprint",
    });

    const store = useFlowentWorkspaceStore.getState();

    store.addQuickNode("trigger");
    store.startWorkflowRun();

    expect(useFlowentWorkspaceStore.getState().nodes).toEqual([]);
    expect(useFlowentWorkspaceStore.getState().edges).toEqual([]);
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
    const activeBlueprint = state.blueprints.find(
      (blueprint) => blueprint.id === state.activeBlueprintId,
    );

    expect(state.activeBlueprintId).toBe("blueprint-launch-campaign");
    expect(state.canvasMode).toBe("workflow");
    expect(activeBlueprint?.lastRunStatus).toBe("running");
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

  it("adds new runs to the top of the current blueprint runs and selects them", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    const firstRunId = getActiveBlueprint().selectedRunId;

    store.finishWorkflowRun();
    store.startWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();
    const activeBlueprint = getActiveBlueprint();

    expect(activeBlueprint.runHistory).toHaveLength(2);
    expect(activeBlueprint.runHistory[0]?.id).not.toBe(firstRunId);
    expect(activeBlueprint.runHistory[1]?.id).toBe(firstRunId);
    expect(activeBlueprint.runHistory[0]?.status).toBe("running");
    expect(activeBlueprint.runHistory[1]?.status).toBe("succeeded");
    expect(activeBlueprint.selectedRunId).toBe(
      activeBlueprint.runHistory[0]?.id,
    );
    expect(state.canvasMode).toBe("workflow");
    expect(state.nodes).toEqual(activeBlueprint.runHistory[0]?.nodes);
    expect(state.edges).toEqual(activeBlueprint.runHistory[0]?.edges);
  });

  it("keeps run instances isolated per blueprint", () => {
    const store = useFlowentWorkspaceStore.getState();
    const firstBlueprintId = getActiveBlueprint().id;

    store.startWorkflowRun();
    const firstRunId = getActiveBlueprint().selectedRunId;
    const secondBlueprintId = store.createBlueprint("Second Blueprint");

    useFlowentWorkspaceStore.getState().startWorkflowRun();

    const state = useFlowentWorkspaceStore.getState();
    const firstBlueprint = state.blueprints.find(
      (blueprint) => blueprint.id === firstBlueprintId,
    );
    const secondBlueprint = state.blueprints.find(
      (blueprint) => blueprint.id === secondBlueprintId,
    );

    expect(firstBlueprint?.runHistory.map((run) => run.id)).toEqual([
      firstRunId,
    ]);
    expect(secondBlueprint?.runHistory).toHaveLength(1);
    expect(secondBlueprint?.runHistory[0]?.id).not.toBe(firstRunId);

    useFlowentWorkspaceStore.getState().openBlueprint(firstBlueprintId);

    expect(getActiveBlueprint().runHistory.map((run) => run.id)).toEqual([
      firstRunId,
    ]);
    expect(useFlowentWorkspaceStore.getState().canvasMode).toBe("blueprint");
  });

  it("selects historical runs with matching node details", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.updateNodeData("trigger-1", {
      initialPayload: "First payload",
    });
    store.startWorkflowRun();
    store.finishWorkflowRun();
    store.returnToBlueprintMode();
    store.updateNodeData("trigger-1", {
      initialPayload: "Second payload",
    });
    store.startWorkflowRun();
    store.finishWorkflowRun();

    const [secondRun, firstRun] = getActiveBlueprint().runHistory;

    if (!firstRun || !secondRun) {
      throw new Error("Missing run instances");
    }

    store.setSelection(["agent-1"], []);
    store.selectWorkflowRun(firstRun.id);

    const firstDetails = getNode("agent-1").data.runDetails;
    expect(useFlowentWorkspaceStore.getState().selectedNodeIds).toEqual([
      "agent-1",
    ]);
    expect(firstDetails?.kind).toBe("agent");
    if (firstDetails?.kind !== "agent") {
      throw new Error("Missing first run details");
    }
    expect(firstDetails.inputPayload).toBe("First payload");

    store.selectWorkflowRun(secondRun.id);

    const secondDetails = getNode("agent-1").data.runDetails;
    expect(secondDetails?.kind).toBe("agent");
    if (secondDetails?.kind !== "agent") {
      throw new Error("Missing second run details");
    }
    expect(secondDetails.inputPayload).toBe("Second payload");
  });

  it("returns to the editable blueprint without saving run snapshots into it", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.finishWorkflowRun();

    const runSnapshot = getActiveBlueprint().runHistory[0];

    expect(
      runSnapshot?.nodes.every((node) => node.data.status === "success"),
    ).toBe(true);

    store.returnToBlueprintMode();

    const state = useFlowentWorkspaceStore.getState();
    const activeBlueprint = getActiveBlueprint();

    expect(state.canvasMode).toBe("blueprint");
    expect(
      activeBlueprint.nodes.every((node) => node.data.status === "idle"),
    ).toBe(true);
    expect(activeBlueprint.nodes.every((node) => !node.data.runDetails)).toBe(
      true,
    );
    expect(state.nodes.every((node) => node.data.status === "idle")).toBe(true);
    expect(state.nodes.every((node) => !node.data.runDetails)).toBe(true);
    expect(state.edges.every((edge) => edge.animated === false)).toBe(true);
    expect(activeBlueprint.runHistory[0]?.nodes).toEqual(runSnapshot?.nodes);
  });

  it("keeps deleted model references visible for reselection", async () => {
    mockSuccessfulSettingsSave();

    await useFlowentWorkspaceStore
      .getState()
      .deleteModelPreset("preset-writing");

    const state = useFlowentWorkspaceStore.getState();

    expect(
      state.modelPresets.some((preset) => preset.id === "preset-writing"),
    ).toBe(false);
    expect(getNode("agent-1").data.modelPresetId).toBe("preset-writing");
    expect(
      state.roles.find((role) => role.id === "role-product-copywriter")
        ?.modelPresetId,
    ).toBe("preset-writing");
  });

  it("returns to blueprint mode with run presentation cleared", () => {
    const store = useFlowentWorkspaceStore.getState();

    store.startWorkflowRun();
    store.returnToBlueprintMode();

    const state = useFlowentWorkspaceStore.getState();
    const activeBlueprint = state.blueprints.find(
      (blueprint) => blueprint.id === state.activeBlueprintId,
    );

    expect(state.canvasMode).toBe("blueprint");
    expect(
      activeBlueprint?.nodes.every((node) => node.data.status === "idle"),
    ).toBe(true);
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
