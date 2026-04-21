import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type {
  Connection,
  Edge as FlowEdge,
  EdgeMouseHandler,
  Node as FlowNode,
  NodeMouseHandler,
  ReactFlowInstance,
} from "@xyflow/react";
import { toast } from "sonner";
import { type ContextMenuEntry } from "@/components/ContextMenu";
import {
  useAgentActivityRuntime,
  useAgentNodesRuntime,
  useAgentTabsRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { terminateNode } from "@/lib/api";
import { AGENT_NODE_HEIGHT, getAgentNodeWidth } from "@/lib/layout";
import { getNodeLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  AgentGraphController,
  AgentGraphProps,
  AgentNodeData,
} from "@/components/agent-graph/lib";
import {
  EDGE_EXIT_MS,
  LAYOUT_RETRY_LIMIT,
  NODE_EXIT_MS,
  VIEWPORT_FIT_MAX_ZOOM,
  VIEWPORT_FIT_PADDING,
  getCanonicalEdgeId,
  getHorizontalHandleIds,
  getPointerPosition,
} from "@/components/agent-graph/lib";

function useTransientGraphElements(
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const [renderNodes, setRenderNodes] = useState<FlowNode[]>(nodes);
  const [renderEdges, setRenderEdges] = useState<FlowEdge[]>(edges);
  const nodeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const edgeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setRenderNodes((prev) => {
      const nextIds = new Set(nodes.map((node) => node.id));
      const prevMap = new Map(prev.map((node) => [node.id, node] as const));
      const nextNodes = nodes.map((node) => {
        const timer = nodeTimers.current.get(node.id);
        if (timer) {
          clearTimeout(timer);
          nodeTimers.current.delete(node.id);
        }

        const previous = prevMap.get(node.id);
        return {
          ...previous,
          ...node,
          className: cn(node.className, "agent-graph-node-present"),
          data: {
            ...((previous?.data as Record<string, unknown> | undefined) ?? {}),
            ...((node.data as Record<string, unknown> | undefined) ?? {}),
            leaving: false,
          },
        } satisfies FlowNode;
      });

      for (const node of prev) {
        if (nextIds.has(node.id)) {
          continue;
        }
        if (!nodeTimers.current.has(node.id)) {
          const timer = setTimeout(() => {
            setRenderNodes((current) =>
              current.filter((item) => item.id !== node.id),
            );
            nodeTimers.current.delete(node.id);
          }, NODE_EXIT_MS);
          nodeTimers.current.set(node.id, timer);
        }

        nextNodes.push({
          ...node,
          className: cn(node.className, "agent-graph-node-leaving"),
          data: {
            ...((node.data as Record<string, unknown> | undefined) ?? {}),
            leaving: true,
          },
        } satisfies FlowNode);
      }

      return nextNodes;
    });
  }, [nodes]);

  useEffect(() => {
    setRenderEdges((prev) => {
      const nextIds = new Set<string>();
      for (let i = 0; i < edges.length; i++) nextIds.add(edges[i].id);
      const prevMap = new Map<string, FlowEdge>();
      for (let i = 0; i < prev.length; i++) prevMap.set(prev[i].id, prev[i]);
      const nextEdges = edges.map((edge) => {
        const timer = edgeTimers.current.get(edge.id);
        if (timer) {
          clearTimeout(timer);
          edgeTimers.current.delete(edge.id);
        }

        const previous = prevMap.get(edge.id);
        return {
          ...previous,
          ...edge,
          data: {
            ...((previous?.data as Record<string, unknown> | undefined) ?? {}),
            ...((edge.data as Record<string, unknown> | undefined) ?? {}),
            leaving: false,
          },
        } satisfies FlowEdge;
      });

      for (const edge of prev) {
        if (nextIds.has(edge.id)) {
          continue;
        }
        if (!edgeTimers.current.has(edge.id)) {
          const timer = setTimeout(() => {
            setRenderEdges((current) =>
              current.filter((item) => item.id !== edge.id),
            );
            edgeTimers.current.delete(edge.id);
          }, EDGE_EXIT_MS);
          edgeTimers.current.set(edge.id, timer);
        }

        nextEdges.push({
          ...edge,
          data: {
            ...((edge.data as Record<string, unknown> | undefined) ?? {}),
            leaving: true,
          },
        } satisfies FlowEdge);
      }

      return nextEdges;
    });
  }, [edges]);

  useEffect(() => {
    const nodeTimersMap = nodeTimers.current;
    const edgeTimersMap = edgeTimers.current;
    return () => {
      for (const timer of nodeTimersMap.values()) {
        clearTimeout(timer);
      }
      for (const timer of edgeTimersMap.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { nodes: renderNodes, edges: renderEdges };
}

export function useAgentGraphController({
  roles = [],
  loadingRoles = false,
  onConnectModeChange,
  onCreateConnection = async () => undefined,
  onDeleteConnection = async () => undefined,
  onCreateStandaloneAgent = async () => undefined,
  onCreateLinkedAgent = async () => undefined,
  onDeleteAgent = async () => undefined,
  onInsertAgentBetween = async () => undefined,
  onOpenConnectDialog = () => undefined,
}: AgentGraphProps): AgentGraphController {
  const { agents } = useAgentNodesRuntime();
  const { tabs } = useAgentTabsRuntime();
  const { activeMessages, activeToolCalls } = useAgentActivityRuntime();
  const { activeTabId, selectedAgentId, selectAgent } = useAgentUI();
  const [tooltip, setTooltip] = useState<AgentGraphController["tooltip"]>(null);
  const [contextMenu, setContextMenu] =
    useState<AgentGraphController["contextMenu"]>(null);
  const [quickCreate, setQuickCreate] =
    useState<AgentGraphController["quickCreate"]>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(
    null,
  );
  const [viewportZoom, setViewportZoom] = useState(1);
  const [connecting, setConnecting] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [targetPickSourceId, setTargetPickSourceId] = useState<string | null>(
    null,
  );
  const [dragConnectionSourceId, setDragConnectionSourceId] = useState<
    string | null
  >(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [quickCreateRoleName, setQuickCreateRoleName] = useState("");
  const [quickCreateName, setQuickCreateName] = useState("");
  const [submittingQuickCreate, setSubmittingQuickCreate] = useState(false);
  const layoutWorker = useRef<Worker | null>(null);
  const requestedLayoutKey = useRef("");
  const layoutRetryCounts = useRef(new Map<string, number>());
  const [layoutRetryNonce, setLayoutRetryNonce] = useState(0);
  const [layoutState, setLayoutState] = useState<{
    key: string;
    positions: Map<string, { x: number; y: number }>;
  }>({ key: "", positions: new Map() });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastViewportStructureKey = useRef<string | null>(null);
  const [tooltipSize, setTooltipSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const scheduleLayoutRetry = useCallback(
    (key: string, message: string, detail?: unknown) => {
      requestedLayoutKey.current = "";
      console.error(message, detail);

      const retryCount = layoutRetryCounts.current.get(key) ?? 0;
      if (retryCount >= LAYOUT_RETRY_LIMIT) {
        return;
      }

      layoutRetryCounts.current.set(key, retryCount + 1);
      setLayoutRetryNonce((value) => value + 1);
    },
    [],
  );

  useEffect(() => {
    const worker = new Worker(
      new URL("../../lib/layout.worker.ts", import.meta.url),
      { type: "module" },
    );
    const layoutRetryCountMap = layoutRetryCounts.current;
    worker.onerror = (event) => {
      const key = requestedLayoutKey.current;
      if (!key) {
        return;
      }
      scheduleLayoutRetry(key, "AgentGraph layout worker error", event);
    };
    worker.onmessageerror = (event) => {
      const key = requestedLayoutKey.current;
      if (!key) {
        return;
      }
      scheduleLayoutRetry(key, "AgentGraph layout worker message error", event);
    };
    worker.onmessage = (event) => {
      const {
        positions,
        key,
        error,
      }: {
        positions?: Array<{ id: string; position: { x: number; y: number } }>;
        key: string;
        error?: string;
      } = event.data;
      if (key !== requestedLayoutKey.current) {
        return;
      }
      if (error || !positions) {
        scheduleLayoutRetry(
          key,
          "AgentGraph layout worker rejected request",
          error,
        );
        return;
      }
      layoutRetryCounts.current.delete(key);
      const map = new Map<string, { x: number; y: number }>();
      for (const pos of positions) {
        map.set(pos.id, pos.position);
      }
      setLayoutState({ key, positions: map });
    };
    layoutWorker.current = worker;
    return () => {
      requestedLayoutKey.current = "";
      layoutRetryCountMap.clear();
      layoutWorker.current = null;
      worker.terminate();
    };
  }, [scheduleLayoutRetry]);

  const syncViewportZoom = useCallback((zoom: number) => {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return;
    }
    setViewportZoom(zoom);
  }, []);

  const syncViewportZoomFromInstance = useCallback(
    (instance: ReactFlowInstance | null) => {
      if (!instance) {
        return;
      }
      syncViewportZoom(instance.getZoom());
    },
    [syncViewportZoom],
  );

  const fitViewport = useCallback(
    async (options: { padding: number; maxZoom: number; duration: number }) => {
      if (!flowInstance) {
        return false;
      }
      try {
        const didFit = await flowInstance.fitView(options);
        syncViewportZoomFromInstance(flowInstance);
        return didFit;
      } catch {
        return false;
      }
    },
    [flowInstance, syncViewportZoomFromInstance],
  );

  const handleFlowInit = useCallback(
    (instance: ReactFlowInstance) => {
      setFlowInstance(instance);
      syncViewportZoomFromInstance(instance);
    },
    [syncViewportZoomFromInstance],
  );

  const handleViewportMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: { zoom: number }) => {
      syncViewportZoom(viewport.zoom);
    },
    [syncViewportZoom],
  );

  const closeQuickCreate = useCallback(() => {
    setQuickCreate(null);
    setQuickCreateRoleName("");
    setQuickCreateName("");
  }, []);

  const resetConnectionModes = useCallback(() => {
    setConnectMode(false);
    setTargetPickSourceId(null);
    setDragConnectionSourceId(null);
  }, []);

  const clearGraphSelection = useCallback(() => {
    selectAgent(null);
    setSelectedEdgeId(null);
    setTooltip(null);
    setContextMenu(null);
    closeQuickCreate();
    resetConnectionModes();
  }, [closeQuickCreate, resetConnectionModes, selectAgent]);

  const openQuickCreate = useCallback(
    (state: NonNullable<typeof quickCreate>) => {
      setContextMenu(null);
      setQuickCreateRoleName("");
      setQuickCreateName("");
      setQuickCreate(state);
      setConnectMode(false);
      setTargetPickSourceId(null);
    },
    [],
  );

  const enterConnectMode = useCallback(() => {
    setContextMenu(null);
    closeQuickCreate();
    setSelectedEdgeId(null);
    setTargetPickSourceId(null);
    setConnectMode(true);
  }, [closeQuickCreate]);

  useEffect(() => {
    onConnectModeChange?.(connectMode);
  }, [connectMode, onConnectModeChange]);

  const activeEdgeMessages = useMemo(() => {
    const map = new Map<
      string,
      { fromId: string; toId: string; timestamp: number }
    >();
    for (const msg of activeMessages) {
      const edgeId = getCanonicalEdgeId(msg.fromId, msg.toId);
      const current = map.get(edgeId);
      if (!current || current.timestamp <= msg.timestamp) {
        map.set(edgeId, {
          fromId: msg.fromId,
          toId: msg.toId,
          timestamp: msg.timestamp,
        });
      }
    }
    return map;
  }, [activeMessages]);

  const visibleAgents = useMemo(
    () =>
      Array.from(agents.values()).filter((agent) => {
        if (agent.node_type === "assistant" || agent.is_leader) {
          return false;
        }
        if (activeTabId) {
          return agent.tab_id === activeTabId;
        }
        return agent.tab_id == null;
      }),
    [activeTabId, agents],
  );

  const visibleAgentMap = useMemo(
    () => new Map(visibleAgents.map((agent) => [agent.id, agent] as const)),
    [visibleAgents],
  );
  const connectPreviewSourceId = dragConnectionSourceId ?? targetPickSourceId;
  const showConnectionEntryHint =
    Boolean(activeTabId) &&
    (connectMode || connecting || Boolean(connectPreviewSourceId));
  const isValidDirectConnection = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      if (sourceNodeId === targetNodeId) {
        return false;
      }
      const sourceNode = visibleAgentMap.get(sourceNodeId);
      const targetNode = visibleAgentMap.get(targetNodeId);
      if (!sourceNode || !targetNode) {
        return false;
      }
      return !sourceNode.connections.includes(targetNodeId);
    },
    [visibleAgentMap],
  );

  const transientData = useMemo(() => {
    const data = new Map<string, AgentNodeData>();

    for (const agent of visibleAgents) {
      const id = agent.id;
      const label = getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
        isLeader: agent.is_leader,
      });
      data.set(id, {
        label,
        width: getAgentNodeWidth(label),
        node_type: agent.node_type,
        is_leader: agent.is_leader,
        state: agent.state,
        shortId: id.slice(0, 8),
        name: agent.name,
        role_name: agent.role_name,
        latestTodo: agent.todos[agent.todos.length - 1]?.text ?? null,
        selected: id === selectedAgentId && selectedEdgeId === null,
        toolCall: activeToolCalls.get(id) ?? null,
        leaving: false,
        canConnect: Boolean(activeTabId),
        showConnectionEntryHint,
        connectionState: connectPreviewSourceId
          ? id === connectPreviewSourceId
            ? "source"
            : isValidDirectConnection(connectPreviewSourceId, id)
              ? "valid-target"
              : "invalid-target"
          : null,
      });
    }

    return data;
  }, [
    activeTabId,
    activeToolCalls,
    connectPreviewSourceId,
    isValidDirectConnection,
    selectedAgentId,
    selectedEdgeId,
    showConnectionEntryHint,
    visibleAgents,
  ]);

  const { rawNodes, baseEdges, structureKey } = useMemo(() => {
    const visibleAgentIds = new Set<string>();
    for (let i = 0; i < visibleAgents.length; i++)
      visibleAgentIds.add(visibleAgents[i].id);
    const seenEdgeIds = new Set<string>();
    const nextBaseEdges: FlowEdge[] = [];
    for (const agent of visibleAgents) {
      for (const targetId of agent.connections) {
        if (!visibleAgentIds.has(targetId)) {
          continue;
        }
        const edgeId = getCanonicalEdgeId(agent.id, targetId);
        if (seenEdgeIds.has(edgeId)) {
          continue;
        }
        seenEdgeIds.add(edgeId);
        const [source, target] =
          agent.id <= targetId ? [agent.id, targetId] : [targetId, agent.id];
        nextBaseEdges.push({
          id: edgeId,
          source,
          target,
          type: "animated",
        });
      }
    }

    const nextRawNodes: FlowNode[] = visibleAgents.flatMap((agent) => {
      const data = transientData.get(agent.id);
      if (!data) {
        return [];
      }
      return [
        {
          id: agent.id,
          type: "agent",
          position: { x: 0, y: 0 },
          width: data.width,
          height: AGENT_NODE_HEIGHT,
          data,
          className: "agent-graph-node-shell",
        } satisfies FlowNode,
      ];
    });

    const nextStructureKey = `${activeTabId ?? "unassigned"}:${visibleAgents
      .map((agent) => {
        const data = transientData.get(agent.id);
        return `${agent.id}:${data?.label ?? ""}:${agent.connections
          .filter((targetId) => visibleAgentIds.has(targetId))
          .sort()
          .join(",")}`;
      })
      .sort()
      .join("|")}:${nextBaseEdges
      .map((edge) => edge.id)
      .sort()
      .join("|")}`;

    return {
      rawNodes: nextRawNodes,
      baseEdges: nextBaseEdges,
      structureKey: nextStructureKey,
    };
  }, [activeTabId, transientData, visibleAgents]);

  useEffect(() => {
    if (rawNodes.length === 0) {
      requestedLayoutKey.current = "";
      layoutRetryCounts.current.clear();
      return;
    }
    if (layoutState.key === structureKey) {
      return;
    }
    if (requestedLayoutKey.current === structureKey) {
      return;
    }
    const worker = layoutWorker.current;
    if (!worker) {
      return;
    }
    worker.postMessage({
      nodes: rawNodes,
      edges: baseEdges,
      key: structureKey,
    });
    requestedLayoutKey.current = structureKey;
  }, [baseEdges, layoutRetryNonce, layoutState.key, rawNodes, structureKey]);

  const graphElements = useMemo(() => {
    const positions = layoutState.positions;
    const nodes = rawNodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
    }));
    const nodePositions = new Map(
      nodes.map((node) => [node.id, node.position] as const),
    );
    const edges = baseEdges.map((edge) => {
      const activeMessage = activeEdgeMessages.get(edge.id);
      const handleIds = getHorizontalHandleIds(
        nodePositions.get(edge.source),
        nodePositions.get(edge.target),
      );
      return {
        ...edge,
        ...handleIds,
        data: {
          active: !!activeMessage,
          flowDirection: activeMessage
            ? activeMessage.fromId === edge.source &&
              activeMessage.toId === edge.target
              ? "forward"
              : "reverse"
            : null,
          leaving: false,
          selected: edge.id === selectedEdgeId,
        },
        animated: false,
      } satisfies FlowEdge;
    });

    return { nodes, edges, structureKey };
  }, [
    activeEdgeMessages,
    baseEdges,
    layoutState.positions,
    rawNodes,
    selectedEdgeId,
    structureKey,
  ]);

  const { nodes: animatedNodes, edges: animatedEdges } =
    useTransientGraphElements(graphElements.nodes, graphElements.edges);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (
        node.type !== "agent" ||
        (node.data as Record<string, unknown> | undefined)?.leaving
      ) {
        return;
      }
      if (targetPickSourceId && activeTabId) {
        if (node.id === targetPickSourceId) {
          return;
        }
        if (!isValidDirectConnection(targetPickSourceId, node.id)) {
          toast.error("Duplicate connections are not allowed");
          return;
        }
        void onCreateConnection(activeTabId, targetPickSourceId, node.id)
          .then(() => {
            setTargetPickSourceId(null);
            setSelectedEdgeId(null);
          })
          .catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to connect agents",
            );
          });
        return;
      }
      setSelectedEdgeId(null);
      selectAgent(node.id);
    },
    [
      activeTabId,
      isValidDirectConnection,
      onCreateConnection,
      selectAgent,
      targetPickSourceId,
    ],
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback((event, node) => {
    if (node.type !== "agent") {
      return;
    }
    const mouseEvent = event as unknown as ReactMouseEvent;
    setTooltip({
      agentId: node.id,
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
    });
  }, []);

  const onNodeMouseMove: NodeMouseHandler = useCallback((event, node) => {
    if (node.type !== "agent") {
      return;
    }
    const mouseEvent = event as unknown as ReactMouseEvent;
    setTooltip({
      agentId: node.id,
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
    });
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setTooltip(null);
  }, []);

  const onPaneClick = useCallback(() => {
    clearGraphSelection();
  }, [clearGraphSelection]);

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      setTooltip(null);
      setContextMenu({
        kind: "pane",
        x: (event as globalThis.MouseEvent).clientX,
        y: (event as globalThis.MouseEvent).clientY,
      });
    },
    [],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      if (node.type !== "agent") {
        return;
      }
      const mouseEvent = event as unknown as globalThis.MouseEvent;
      mouseEvent.preventDefault();
      selectAgent(node.id);
      setSelectedEdgeId(null);
      setTooltip(null);
      setContextMenu({
        kind: "node",
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        agentId: node.id,
      });
    },
    [selectAgent],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!activeTabId || !connection.source || !connection.target) {
        return;
      }
      void onCreateConnection(activeTabId, connection.source, connection.target)
        .then(() => {
          setConnectMode(false);
          setSelectedEdgeId(null);
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "Failed to connect agents",
          );
        });
    },
    [activeTabId, onCreateConnection],
  );

  const onConnectStart = useCallback(
    (
      _event: globalThis.MouseEvent | TouchEvent,
      params?: {
        nodeId: string | null;
        handleType: "source" | "target" | null;
      },
    ) => {
      setSelectedEdgeId(null);
      setDragConnectionSourceId(params?.nodeId ?? null);
      if (params?.nodeId) {
        selectAgent(params.nodeId);
      }
      setConnecting(true);
    },
    [selectAgent],
  );

  const onConnectEnd = useCallback(
    (
      event?: globalThis.MouseEvent | TouchEvent,
      state?: Record<string, unknown>,
    ) => {
      setConnecting(false);
      setDragConnectionSourceId(null);

      const fromNode = state?.fromNode as { id: string } | null | undefined;
      const toNode = state?.toNode as { id: string } | null | undefined;

      if (!toNode && activeTabId && fromNode && event) {
        const pointer = getPointerPosition(event);
        if (pointer) {
          openQuickCreate({
            kind: "linked",
            x: pointer.x,
            y: pointer.y,
            anchorNodeId: fromNode.id,
          });
          return;
        }
      }

      if (!connectMode) {
        setConnectMode(false);
      }
    },
    [activeTabId, connectMode, openQuickCreate],
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_, edge) => {
      setSelectedEdgeId(edge.id);
      setTooltip(null);
      setContextMenu(null);
      closeQuickCreate();
      setTargetPickSourceId(null);
      selectAgent(null);
    },
    [closeQuickCreate, selectAgent],
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      const mouseEvent = event as unknown as globalThis.MouseEvent;
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      setSelectedEdgeId(edge.id);
      setTooltip(null);
      selectAgent(null);
      setContextMenu({
        kind: "edge",
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        sourceId: edge.source,
        targetId: edge.target,
      });
    },
    [selectAgent],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuItems = useMemo((): ContextMenuEntry[] => {
    if (!contextMenu) {
      return [];
    }
    const items: ContextMenuEntry[] = [];

    if (contextMenu.kind === "node") {
      const contextAgent = agents.get(contextMenu.agentId) ?? null;
      if (!contextAgent || !activeTabId) {
        return [];
      }
      items.push({
        label: "Add Connected Agent",
        onClick: () => {
          openQuickCreate({
            kind: "linked",
            x: contextMenu.x,
            y: contextMenu.y,
            anchorNodeId: contextAgent.id,
          });
        },
      });
      items.push({
        label: "Connect To...",
        onClick: () => {
          setQuickCreate(null);
          setConnectMode(false);
          setTargetPickSourceId(contextAgent.id);
          setSelectedEdgeId(null);
          selectAgent(contextAgent.id);
        },
      });
      if (!contextAgent.is_leader) {
        items.push("divider");
        items.push({
          label: "Stop Agent",
          danger: true,
          onClick: () => {
            terminateNode(contextAgent.id).catch(() =>
              toast.error("Failed to terminate agent"),
            );
          },
        });
        items.push({
          label: "Delete Agent",
          danger: true,
          onClick: () => {
            void onDeleteAgent({
              tabId: activeTabId,
              node: contextAgent,
              tabAgents: visibleAgents,
            }).catch((error) => {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to delete agent",
              );
            });
          },
        });
      }
      return items;
    }

    if (contextMenu.kind === "edge") {
      if (!activeTabId) {
        return [];
      }
      items.push({
        label: "Insert Agent Between",
        onClick: () => {
          openQuickCreate({
            kind: "between",
            x: contextMenu.x,
            y: contextMenu.y,
            sourceNodeId: contextMenu.sourceId,
            targetNodeId: contextMenu.targetId,
          });
        },
      });
      items.push({
        label: "Delete Connection",
        danger: true,
        onClick: () => {
          void onDeleteConnection(
            activeTabId,
            contextMenu.sourceId,
            contextMenu.targetId,
          ).catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to delete connection",
            );
          });
        },
      });
      return items;
    }

    items.push({
      label: "Add Agent",
      disabled: !activeTabId,
      onClick: () => {
        openQuickCreate({
          kind: "standalone",
          x: contextMenu.x,
          y: contextMenu.y,
        });
      },
    });
    items.push({
      label: "Connect Agents...",
      disabled: !activeTabId || visibleAgents.length < 2,
      onClick: onOpenConnectDialog,
    });
    items.push("divider");
    items.push({
      label: "Fit View",
      disabled: !flowInstance,
      onClick: () => {
        void fitViewport({
          padding: VIEWPORT_FIT_PADDING,
          maxZoom: VIEWPORT_FIT_MAX_ZOOM,
          duration: 350,
        });
      },
    });
    items.push({
      label: "Clear Selection",
      onClick: () => {
        clearGraphSelection();
      },
    });
    return items;
  }, [
    activeTabId,
    agents,
    clearGraphSelection,
    contextMenu,
    fitViewport,
    flowInstance,
    onDeleteAgent,
    onDeleteConnection,
    onOpenConnectDialog,
    openQuickCreate,
    selectAgent,
    visibleAgents,
  ]);

  const tooltipAgent = tooltip ? (agents.get(tooltip.agentId) ?? null) : null;
  const tooltipToolCall =
    tooltip && tooltip.agentId
      ? (activeToolCalls.get(tooltip.agentId) ?? null)
      : null;

  useEffect(() => {
    if (!tooltip || !tooltipAgent) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const el = tooltipRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      setTooltipSize((prev) =>
        prev &&
        Math.abs(prev.width - rect.width) < 0.5 &&
        Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [tooltip, tooltipAgent]);

  useEffect(() => {
    if (!flowInstance || animatedNodes.length === 0) {
      return;
    }
    if (lastViewportStructureKey.current === graphElements.structureKey) {
      return;
    }
    const isInitialViewport = lastViewportStructureKey.current === null;
    lastViewportStructureKey.current = graphElements.structureKey;

    const raf = requestAnimationFrame(() => {
      void fitViewport({
        padding: VIEWPORT_FIT_PADDING,
        maxZoom: VIEWPORT_FIT_MAX_ZOOM,
        duration: isInitialViewport ? 0 : 250,
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [
    animatedNodes.length,
    fitViewport,
    flowInstance,
    graphElements.structureKey,
  ]);

  useEffect(() => {
    if (!flowInstance || !containerRef.current || animatedNodes.length === 0) {
      return;
    }

    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        void fitViewport({
          padding: VIEWPORT_FIT_PADDING,
          maxZoom: VIEWPORT_FIT_MAX_ZOOM,
          duration: 250,
        });
      });
    });

    observer.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [animatedNodes.length, fitViewport, flowInstance]);

  useEffect(() => {
    if (
      selectedEdgeId &&
      !graphElements.edges.some((edge) => edge.id === selectedEdgeId)
    ) {
      setSelectedEdgeId(null);
    }
  }, [graphElements.edges, selectedEdgeId]);

  useEffect(() => {
    if (targetPickSourceId && !visibleAgentMap.has(targetPickSourceId)) {
      setTargetPickSourceId(null);
    }
  }, [targetPickSourceId, visibleAgentMap]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (quickCreate) {
        closeQuickCreate();
        return;
      }
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      if (targetPickSourceId || connectMode) {
        resetConnectionModes();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    closeQuickCreate,
    connectMode,
    contextMenu,
    quickCreate,
    resetConnectionModes,
    targetPickSourceId,
  ]);

  const tooltipStyle = useMemo(() => {
    if (!tooltip || typeof window === "undefined") {
      return undefined;
    }
    const margin = 8;
    const offset = 12;
    const width = tooltipSize?.width ?? 280;
    const height = tooltipSize?.height ?? 120;
    const maxLeft = window.innerWidth - margin - width;
    const maxTop = window.innerHeight - margin - height;
    const left = Math.max(margin, Math.min(tooltip.x + offset, maxLeft));
    const top = Math.max(margin, Math.min(tooltip.y + offset, maxTop));
    return { left, top };
  }, [tooltip, tooltipSize]);

  const availableRoles = roles;

  const submitQuickCreate = useCallback(async () => {
    if (!quickCreate || !activeTabId || !quickCreateRoleName.trim()) {
      return;
    }

    setSubmittingQuickCreate(true);
    try {
      if (quickCreate.kind === "standalone") {
        await onCreateStandaloneAgent({
          tabId: activeTabId,
          roleName: quickCreateRoleName,
          name: quickCreateName,
        });
      } else if (quickCreate.kind === "linked") {
        await onCreateLinkedAgent({
          tabId: activeTabId,
          anchorNodeId: quickCreate.anchorNodeId,
          roleName: quickCreateRoleName,
          name: quickCreateName,
        });
      } else {
        await onInsertAgentBetween({
          tabId: activeTabId,
          sourceNodeId: quickCreate.sourceNodeId,
          targetNodeId: quickCreate.targetNodeId,
          roleName: quickCreateRoleName,
          name: quickCreateName,
        });
      }
      closeQuickCreate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update network",
      );
    } finally {
      setSubmittingQuickCreate(false);
    }
  }, [
    activeTabId,
    closeQuickCreate,
    onCreateLinkedAgent,
    onCreateStandaloneAgent,
    onInsertAgentBetween,
    quickCreate,
    quickCreateName,
    quickCreateRoleName,
  ]);

  const emptyState = useMemo(() => {
    if (tabs.size === 0) {
      return {
        eyebrow: "Workspace",
        title: "No workflows yet",
        description: "Create a workflow to start building an agent network.",
        hint: "Use the + button in the workflow strip to open your first workspace.",
      };
    }
    if (!activeTabId) {
      return {
        eyebrow: "Workspace",
        title: "Select a workflow",
        description: "Choose a workflow to inspect and edit its agent network.",
        hint: "Each workflow keeps its own goal, nodes, and connections.",
      };
    }
    return {
      eyebrow: "Empty canvas",
      title: "This workflow is ready for its first agent",
      description: "Add agents and connect them to build the network.",
      hint: "Start with a worker, a reviewer, or another helper node.",
    };
  }, [activeTabId, tabs.size]);

  const connectHintLabel = useMemo(() => {
    if (targetPickSourceId) {
      const sourceAgent = agents.get(targetPickSourceId);
      return sourceAgent
        ? `Connect ${getNodeLabel({
            name: sourceAgent.name,
            roleName: sourceAgent.role_name,
            nodeType: sourceAgent.node_type,
            isLeader: sourceAgent.is_leader,
          })}`
        : "Connect Agent";
    }
    if (connectMode) {
      return "Connect Mode";
    }
    return null;
  }, [agents, connectMode, targetPickSourceId]);

  const isValidConnection = useCallback(
    (edgeOrConnection: FlowEdge | Connection) => {
      if (!edgeOrConnection.source || !edgeOrConnection.target) {
        return false;
      }
      return isValidDirectConnection(
        edgeOrConnection.source,
        edgeOrConnection.target,
      );
    },
    [isValidDirectConnection],
  );

  return {
    activeTabId,
    animatedEdges,
    animatedNodes,
    availableRoles,
    closeContextMenu,
    closeQuickCreate,
    connectHintLabel,
    containerRef,
    contextMenu,
    contextMenuItems,
    emptyState,
    enterConnectMode,
    handleFlowInit,
    handleViewportMove,
    isValidConnection,
    loadingRoles,
    onConnect,
    onConnectEnd,
    onConnectStart,
    onEdgeClick,
    onEdgeContextMenu,
    onNodeClick,
    onNodeContextMenu,
    onNodeMouseEnter,
    onNodeMouseLeave,
    onNodeMouseMove,
    onPaneClick,
    onPaneContextMenu,
    quickCreate,
    quickCreateName,
    quickCreateRoleName,
    setQuickCreateName,
    setQuickCreateRoleName,
    submitQuickCreate: () => {
      void submitQuickCreate();
    },
    submittingQuickCreate,
    tooltip,
    tooltipAgent,
    tooltipRef,
    tooltipStyle,
    tooltipToolCall,
    viewportZoom,
  };
}
