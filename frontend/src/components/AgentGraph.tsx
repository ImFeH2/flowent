import {
  forwardRef,
  useMemo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  ConnectionMode,
  type Connection,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { AgentEdge } from "@/components/AgentEdge";
import { AgentNode } from "@/components/AgentNode";
import { AgentTooltip } from "@/components/AgentTooltip";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import { ViewportPortal } from "@/components/ViewportPortal";
import { AGENT_NODE_HEIGHT, getAgentNodeWidth } from "@/lib/layout";
import { cn, formatZoomPercentage } from "@/lib/utils";
import {
  useAgentActivityRuntime,
  useAgentNodesRuntime,
  useAgentTabsRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { terminateNode } from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";
import type {
  AgentState,
  Node as AgentGraphNode,
  NodeType,
  Role,
} from "@/types";

const NODE_EXIT_MS = 320;
const EDGE_EXIT_MS = 220;
const VIEWPORT_FIT_PADDING = 0.3;
const VIEWPORT_FIT_MAX_ZOOM = 1;
const VIEWPORT_MIN_ZOOM = 0.05;
const VIEWPORT_MAX_ZOOM = 6;
const LAYOUT_RETRY_LIMIT = 1;
const graphChromePillClass =
  "rounded-md border border-border bg-popover px-3 py-1 text-[11px] font-medium text-popover-foreground shadow-sm";
const quickCreateInputClass =
  "h-8 w-full rounded-md border border-input bg-background/55 px-3 text-[13px] text-foreground shadow-xs placeholder:text-muted-foreground transition-[border-color,box-shadow] focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50";
const quickCreateListClass =
  "max-h-56 space-y-2 overflow-y-auto rounded-md border border-border bg-background/40 p-2 scrollbar-none";
const quickCreateButtonClass =
  "w-full rounded-md border px-3 py-2 text-left transition-colors";

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

const edgeTypes: EdgeTypes = {
  animated: AgentEdge,
};

type FlowFitViewOptions = NonNullable<
  Parameters<ReactFlowInstance["fitView"]>[0]
>;

interface TooltipData {
  agentId: string;
  x: number;
  y: number;
}

type ContextMenuState =
  | {
      kind: "pane";
      x: number;
      y: number;
    }
  | {
      kind: "node";
      x: number;
      y: number;
      agentId: string;
    }
  | {
      kind: "edge";
      x: number;
      y: number;
      sourceId: string;
      targetId: string;
    };

type QuickCreateState =
  | {
      kind: "standalone";
      x: number;
      y: number;
    }
  | {
      kind: "linked";
      x: number;
      y: number;
      anchorNodeId: string;
    }
  | {
      kind: "between";
      x: number;
      y: number;
      sourceNodeId: string;
      targetNodeId: string;
    };

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  node_type: NodeType;
  is_leader: boolean;
  state: AgentState;
  shortId: string;
  name: string | null;
  role_name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
  leaving: boolean;
  canConnect: boolean;
  showConnectionEntryHint: boolean;
  connectionState?: "source" | "valid-target" | "invalid-target" | null;
}

export interface AgentGraphHandle {
  enterConnectMode: () => void;
}

interface AgentGraphProps {
  roles?: Role[];
  loadingRoles?: boolean;
  onConnectModeChange?: (active: boolean) => void;
  onCreateConnection?: (
    tabId: string,
    sourceNodeId: string,
    targetNodeId: string,
  ) => Promise<void>;
  onDeleteConnection?: (
    tabId: string,
    sourceNodeId: string,
    targetNodeId: string,
  ) => Promise<void>;
  onCreateStandaloneAgent?: (input: {
    tabId: string;
    roleName: string;
    name?: string;
  }) => Promise<unknown>;
  onCreateLinkedAgent?: (input: {
    tabId: string;
    anchorNodeId: string;
    roleName: string;
    name?: string;
  }) => Promise<unknown>;
  onDeleteAgent?: (input: {
    tabId: string;
    node: AgentGraphNode;
    tabAgents: AgentGraphNode[];
  }) => Promise<void>;
  onInsertAgentBetween?: (input: {
    tabId: string;
    sourceNodeId: string;
    targetNodeId: string;
    roleName: string;
    name?: string;
  }) => Promise<unknown>;
  onOpenConnectDialog?: () => void;
}

function getCanonicalEdgeId(leftId: string, rightId: string) {
  return leftId <= rightId
    ? `${leftId}<->${rightId}`
    : `${rightId}<->${leftId}`;
}

function getHorizontalHandleIds(
  sourcePosition: { x: number; y: number } | undefined,
  targetPosition: { x: number; y: number } | undefined,
) {
  if ((sourcePosition?.x ?? 0) <= (targetPosition?.x ?? 0)) {
    return {
      sourceHandle: "right-entry",
      targetHandle: "left-entry",
    };
  }
  return {
    sourceHandle: "left-entry",
    targetHandle: "right-entry",
  };
}

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

export const AgentGraph = forwardRef<AgentGraphHandle, AgentGraphProps>(
  function AgentGraph(
    {
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
    },
    ref,
  ) {
    const { agents } = useAgentNodesRuntime();
    const { tabs } = useAgentTabsRuntime();
    const { activeMessages, activeToolCalls } = useAgentActivityRuntime();
    const { activeTabId, selectedAgentId, selectAgent } = useAgentUI();
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
      null,
    );
    const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(
      null,
    );
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
    const [quickCreateRoleQuery, setQuickCreateRoleQuery] = useState("");
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
        new URL("../lib/layout.worker.ts", import.meta.url),
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
        scheduleLayoutRetry(
          key,
          "AgentGraph layout worker message error",
          event,
        );
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

    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lastViewportStructureKey = useRef<string | null>(null);
    const [tooltipSize, setTooltipSize] = useState<{
      width: number;
      height: number;
    } | null>(null);

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
      async (options: FlowFitViewOptions) => {
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
      setQuickCreateRoleQuery("");
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

    const openQuickCreate = useCallback((state: QuickCreateState) => {
      setContextMenu(null);
      setQuickCreateRoleQuery("");
      setQuickCreateRoleName("");
      setQuickCreateName("");
      setQuickCreate(state);
      setConnectMode(false);
      setTargetPickSourceId(null);
    }, []);

    const enterConnectMode = useCallback(() => {
      setContextMenu(null);
      closeQuickCreate();
      setSelectedEdgeId(null);
      setTargetPickSourceId(null);
      setConnectMode(true);
    }, [closeQuickCreate]);

    useImperativeHandle(
      ref,
      () => ({
        enterConnectMode,
      }),
      [enterConnectMode],
    );

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
      const visibleAgentIds = new Set<string>();
      for (let i = 0; i < visibleAgents.length; i++)
        visibleAgentIds.add(visibleAgents[i].id);

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
      const baseEdges: FlowEdge[] = [];
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
          baseEdges.push({
            id: edgeId,
            source,
            target,
            type: "animated",
          });
        }
      }

      const rawNodes: FlowNode[] = visibleAgents.flatMap((agent) => {
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

      const structureKey = `${activeTabId ?? "unassigned"}:${visibleAgents
        .map((agent) => {
          const data = transientData.get(agent.id);
          return `${agent.id}:${data?.label ?? ""}:${agent.connections
            .filter((targetId) => visibleAgentIds.has(targetId))
            .sort()
            .join(",")}`;
        })
        .sort()
        .join("|")}:${baseEdges
        .map((edge) => edge.id)
        .sort()
        .join("|")}`;

      return { rawNodes, baseEdges, structureKey };
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
        void onCreateConnection(
          activeTabId,
          connection.source,
          connection.target,
        )
          .then(() => {
            setConnectMode(false);
            setSelectedEdgeId(null);
          })
          .catch((error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to connect agents",
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
      if (
        !flowInstance ||
        !containerRef.current ||
        animatedNodes.length === 0
      ) {
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

    const filteredRoles = useMemo(() => {
      const normalizedQuery = quickCreateRoleQuery.trim().toLowerCase();
      if (!normalizedQuery) {
        return roles;
      }
      return roles.filter((role) =>
        `${role.name} ${role.description}`
          .toLowerCase()
          .includes(normalizedQuery),
      );
    }, [quickCreateRoleQuery, roles]);

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
          title: "No task tabs yet",
          description: "Create a task tab to start building an agent network.",
          hint: "Use the + button in the tab strip to open your first workspace.",
        };
      }
      if (!activeTabId) {
        return {
          eyebrow: "Workspace",
          title: "Select a task tab",
          description: "Choose a tab to inspect and edit its agent network.",
          hint: "Each tab keeps its own goal, nodes, and connections.",
        };
      }
      return {
        eyebrow: "Empty canvas",
        title: "This task tab is ready for its first agent",
        description:
          "Add agents, connect them, or ask Assistant to scaffold the network.",
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

    return (
      <div ref={containerRef} className="relative flex h-full flex-col">
        <div className="relative flex-1 overflow-hidden">
          {animatedNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center px-5 py-8">
              <div className="w-full max-w-[22rem] rounded-xl border border-border bg-surface-overlay/60 px-5 py-5 text-center shadow-md backdrop-blur-sm">
                <div className="mx-auto flex size-10 items-center justify-center rounded-lg border border-border bg-accent/35 text-muted-foreground">
                  <Network className="size-4.5" />
                </div>
                <p className="mt-3.5 text-[9px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/75">
                  {emptyState.eyebrow}
                </p>
                <p className="mt-2.5 text-[18px] font-semibold leading-tight text-foreground">
                  {emptyState.title}
                </p>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  {emptyState.description}
                </p>
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground/75">
                  {emptyState.hint}
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={animatedNodes}
              edges={animatedEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              colorMode="dark"
              onInit={handleFlowInit}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseMove={onNodeMouseMove}
              onNodeMouseLeave={onNodeMouseLeave}
              onPaneClick={onPaneClick}
              onPaneContextMenu={onPaneContextMenu}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeClick={onEdgeClick}
              onEdgeContextMenu={onEdgeContextMenu}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onMove={handleViewportMove}
              isValidConnection={isValidConnection}
              connectionMode={ConnectionMode.Loose}
              connectOnClick={false}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={Boolean(activeTabId)}
              panOnDrag
              zoomOnScroll
              zoomOnPinch
              minZoom={VIEWPORT_MIN_ZOOM}
              maxZoom={VIEWPORT_MAX_ZOOM}
              className="bg-graph-bg"
            >
              <Background color="var(--graph-grid)" gap={28} size={0.72} />
              <svg aria-hidden="true" focusable="false">
                <defs>
                  <linearGradient
                    id="agent-graph-edge-flow"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--graph-edge)"
                      stopOpacity="0.2"
                    />
                    <stop
                      offset="50%"
                      stopColor="var(--graph-edge-active)"
                      stopOpacity="0.94"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--graph-edge)"
                      stopOpacity="0.2"
                    />
                  </linearGradient>
                  <radialGradient
                    id="agent-graph-edge-pulse"
                    cx="50%"
                    cy="50%"
                    r="50%"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--graph-edge-active)"
                      stopOpacity="1"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--graph-edge-active)"
                      stopOpacity="0.2"
                    />
                  </radialGradient>
                  <filter
                    id="agent-graph-edge-glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="2.6" />
                  </filter>
                </defs>
              </svg>
            </ReactFlow>
          )}
        </div>

        {animatedNodes.length > 0 ? (
          <div className="pointer-events-none absolute bottom-4 left-4 z-30">
            <div
              className={graphChromePillClass}
              data-testid="agent-graph-zoom-indicator"
            >
              {formatZoomPercentage(viewportZoom)}
            </div>
          </div>
        ) : null}

        {connectHintLabel ? (
          <div className="pointer-events-none absolute right-4 top-4 z-30">
            <div className={graphChromePillClass}>{connectHintLabel}</div>
          </div>
        ) : null}

        <AgentTooltip
          agent={tooltipAgent}
          agentId={tooltip?.agentId ?? null}
          activeToolCall={tooltipToolCall}
          style={tooltipStyle}
          tooltipRef={tooltipRef}
        />

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onClose={closeContextMenu}
          />
        )}

        {quickCreate ? (
          <GraphQuickCreatePopover
            displayName={quickCreateName}
            filteredRoles={filteredRoles}
            loadingRoles={loadingRoles}
            onClose={closeQuickCreate}
            onDisplayNameChange={setQuickCreateName}
            onRoleQueryChange={setQuickCreateRoleQuery}
            onSelectRole={setQuickCreateRoleName}
            onSubmit={() => void submitQuickCreate()}
            roleQuery={quickCreateRoleQuery}
            selectedRoleName={quickCreateRoleName}
            submitting={submittingQuickCreate}
            title={getQuickCreateTitle(quickCreate)}
            x={quickCreate.x}
            y={quickCreate.y}
          />
        ) : null}
      </div>
    );
  },
);

function getQuickCreateTitle(state: QuickCreateState) {
  if (state.kind === "standalone") {
    return "Add Agent";
  }
  if (state.kind === "between") {
    return "Insert Agent Between";
  }
  return "Add Connected Agent";
}

function getPointerPosition(event: globalThis.MouseEvent | TouchEvent) {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  if (!touch) {
    return null;
  }
  return { x: touch.clientX, y: touch.clientY };
}

function GraphQuickCreatePopover({
  x,
  y,
  title,
  roleQuery,
  selectedRoleName,
  displayName,
  filteredRoles,
  loadingRoles,
  submitting,
  onRoleQueryChange,
  onSelectRole,
  onDisplayNameChange,
  onSubmit,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  roleQuery: string;
  selectedRoleName: string;
  displayName: string;
  filteredRoles: Role[];
  loadingRoles: boolean;
  submitting: boolean;
  onRoleQueryChange: (value: string) => void;
  onSelectRole: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({ left: x, top: y }));

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const margin = 12;
      const rect = element.getBoundingClientRect();
      const maxLeft = window.innerWidth - margin - rect.width;
      const maxTop = window.innerHeight - margin - rect.height;
      setPos({
        left: Math.max(margin, Math.min(x, maxLeft)),
        top: Math.max(margin, Math.min(y, maxTop)),
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [filteredRoles.length, loadingRoles, title, x, y]);

  useEffect(() => {
    const handleMouseDown = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () =>
      document.removeEventListener("mousedown", handleMouseDown, true);
  }, [onClose]);

  return (
    <ViewportPortal>
      <div
        ref={ref}
        className="fixed z-[210] w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-md"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-foreground">{title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Choose a role and optionally set a display name.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center rounded-md px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <input
            aria-label="Search roles"
            autoFocus
            value={roleQuery}
            onChange={(event) => onRoleQueryChange(event.target.value)}
            placeholder="Search roles"
            className={quickCreateInputClass}
          />
          <div className={quickCreateListClass}>
            {loadingRoles ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                Loading roles...
              </p>
            ) : filteredRoles.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                No roles match your search.
              </p>
            ) : (
              filteredRoles.map((role) => (
                <button
                  key={role.name}
                  type="button"
                  onClick={() => onSelectRole(role.name)}
                  className={cn(
                    quickCreateButtonClass,
                    selectedRoleName === role.name
                      ? "border-border bg-accent/70"
                      : "border-transparent bg-transparent hover:border-border hover:bg-accent/45",
                  )}
                >
                  <div className="text-[13px] font-medium text-foreground">
                    {role.name}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {role.description}
                  </div>
                </button>
              ))
            )}
          </div>
          <input
            aria-label="Display Name"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="Optional display name"
            className={quickCreateInputClass}
          />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedRoleName || submitting}
            onClick={onSubmit}
            className="flex h-8 items-center rounded-md bg-primary px-3.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving..." : title}
          </button>
        </div>
      </div>
    </ViewportPortal>
  );
}
