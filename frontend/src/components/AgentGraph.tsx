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
import { cn } from "@/lib/utils";
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

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

const edgeTypes: EdgeTypes = {
  animated: AgentEdge,
};

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
      direction: "upstream" | "downstream";
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
  showIncomingHandle: boolean;
  showOutgoingHandle: boolean;
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
    direction: "upstream" | "downstream";
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
    const [connecting, setConnecting] = useState(false);
    const [connectMode, setConnectMode] = useState(false);
    const [targetPickSourceId, setTargetPickSourceId] = useState<string | null>(
      null,
    );
    const [dragConnectionSourceId, setDragConnectionSourceId] = useState<
      string | null
    >(null);
    const [dragConnectionHandleType, setDragConnectionHandleType] = useState<
      "source" | "target" | null
    >(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [quickCreateRoleQuery, setQuickCreateRoleQuery] = useState("");
    const [quickCreateRoleName, setQuickCreateRoleName] = useState("");
    const [quickCreateName, setQuickCreateName] = useState("");
    const [submittingQuickCreate, setSubmittingQuickCreate] = useState(false);
    const layoutWorker = useRef<Worker | null>(null);
    const requestedLayoutKey = useRef("");
    const [layoutState, setLayoutState] = useState<{
      key: string;
      positions: Map<string, { x: number; y: number }>;
    }>({ key: "", positions: new Map() });

    useEffect(() => {
      const worker = new Worker(
        new URL("../lib/layout.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event) => {
        const { positions, key } = event.data;
        if (key !== requestedLayoutKey.current) {
          return;
        }
        const map = new Map<string, { x: number; y: number }>();
        for (const pos of positions) {
          map.set(pos.id, pos.position);
        }
        setLayoutState({ key, positions: map });
      };
      layoutWorker.current = worker;
      return () => worker.terminate();
    }, []);

    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lastViewportStructureKey = useRef<string | null>(null);
    const [tooltipSize, setTooltipSize] = useState<{
      width: number;
      height: number;
    } | null>(null);

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
      setDragConnectionHandleType(null);
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
        const edgeId = `${msg.fromId}->${msg.toId}`;
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
          if (agent.node_type === "assistant") {
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
    const connectPreviewDirection =
      dragConnectionHandleType ?? (targetPickSourceId ? "source" : null);
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
      const incomingAgentIds = new Set<string>();
      for (const agent of visibleAgents) {
        for (const targetId of agent.connections) {
          if (!visibleAgentIds.has(targetId)) {
            continue;
          }
          incomingAgentIds.add(targetId);
        }
      }

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
          showIncomingHandle:
            Boolean(activeTabId) &&
            (incomingAgentIds.has(id) || connecting || connectMode),
          showOutgoingHandle:
            Boolean(activeTabId) &&
            (agent.connections.some((targetId) =>
              visibleAgentIds.has(targetId),
            ) ||
              connecting ||
              connectMode),
          connectionState:
            connectPreviewSourceId && connectPreviewDirection
              ? id === connectPreviewSourceId
                ? "source"
                : connectPreviewDirection === "source"
                  ? isValidDirectConnection(connectPreviewSourceId, id)
                    ? "valid-target"
                    : "invalid-target"
                  : isValidDirectConnection(id, connectPreviewSourceId)
                    ? "valid-target"
                    : "invalid-target"
              : null,
        });
      }

      return data;
    }, [
      activeTabId,
      activeToolCalls,
      connectMode,
      connectPreviewDirection,
      connectPreviewSourceId,
      connecting,
      isValidDirectConnection,
      selectedAgentId,
      selectedEdgeId,
      visibleAgents,
    ]);

    const { rawNodes, baseEdges, structureKey } = useMemo(() => {
      const visibleAgentIds = new Set<string>();
      for (let i = 0; i < visibleAgents.length; i++)
        visibleAgentIds.add(visibleAgents[i].id);
      const baseEdges = visibleAgents.flatMap((agent) =>
        agent.connections
          .filter((targetId) => visibleAgentIds.has(targetId))
          .map((targetId) => ({
            id: `${agent.id}->${targetId}`,
            source: agent.id,
            target: targetId,
            type: "animated" as const,
          })),
      );

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
        return;
      }
      if (requestedLayoutKey.current === structureKey) {
        return;
      }
      requestedLayoutKey.current = structureKey;
      layoutWorker.current?.postMessage({
        nodes: rawNodes,
        edges: baseEdges,
        key: structureKey,
      });
    }, [structureKey, rawNodes, baseEdges]);

    const graphElements = useMemo(() => {
      const positions = layoutState.positions;
      const nodes = rawNodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? { x: 0, y: 0 },
      }));
      const edges = baseEdges.map((edge) => {
        const activeMessage = activeEdgeMessages.get(edge.id);
        return {
          ...edge,
          data: {
            active: !!activeMessage,
            flowDirection: activeMessage ? "forward" : null,
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
            toast.error("Duplicate directed edges are not allowed");
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
        setDragConnectionHandleType(
          params?.handleType === "target" ? "target" : null,
        );
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
        setDragConnectionHandleType(null);

        const fromNode = state?.fromNode as { id: string } | null | undefined;
        const fromHandle = state?.fromHandle as
          | { type?: "source" | "target" | null }
          | null
          | undefined;
        const toNode = state?.toNode as { id: string } | null | undefined;

        if (!toNode && activeTabId && fromNode && event) {
          const pointer = getPointerPosition(event);
          if (pointer) {
            openQuickCreate({
              kind: "linked",
              x: pointer.x,
              y: pointer.y,
              anchorNodeId: fromNode.id,
              direction:
                fromHandle?.type === "target" ? "upstream" : "downstream",
            });
            return;
          }
        }

        setConnectMode(false);
      },
      [activeTabId, openQuickCreate],
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
          label: "Add Downstream Agent",
          onClick: () => {
            openQuickCreate({
              kind: "linked",
              x: contextMenu.x,
              y: contextMenu.y,
              anchorNodeId: contextAgent.id,
              direction: "downstream",
            });
          },
        });
        items.push({
          label: "Add Upstream Agent",
          onClick: () => {
            openQuickCreate({
              kind: "linked",
              x: contextMenu.x,
              y: contextMenu.y,
              anchorNodeId: contextAgent.id,
              direction: "upstream",
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
          flowInstance?.fitView({
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
        void flowInstance
          .fitView({
            padding: VIEWPORT_FIT_PADDING,
            maxZoom: VIEWPORT_FIT_MAX_ZOOM,
            duration: isInitialViewport ? 0 : 250,
          })
          .catch(() => false);
      });

      return () => cancelAnimationFrame(raf);
    }, [animatedNodes.length, flowInstance, graphElements.structureKey]);

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
          void flowInstance
            .fitView({
              padding: VIEWPORT_FIT_PADDING,
              maxZoom: VIEWPORT_FIT_MAX_ZOOM,
              duration: 250,
            })
            .catch(() => false);
        });
      });

      observer.observe(containerRef.current);

      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
      };
    }, [animatedNodes.length, flowInstance]);

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
            direction: quickCreate.direction,
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
          ? `Connecting From ${getNodeLabel({
              name: sourceAgent.name,
              roleName: sourceAgent.role_name,
              nodeType: sourceAgent.node_type,
              isLeader: sourceAgent.is_leader,
            })}`
          : "Connecting From Agent";
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
              <div className="w-full max-w-[22rem] rounded-[18px] border border-white/7 bg-[rgba(12,12,13,0.48)] px-5 py-5 text-center shadow-[0_18px_42px_-32px_rgba(0,0,0,0.72)] backdrop-blur-sm">
                <div className="mx-auto flex size-10 items-center justify-center rounded-[12px] border border-white/8 bg-white/[0.03] text-white/68">
                  <Network className="size-4.5" />
                </div>
                <p className="mt-3.5 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/34">
                  {emptyState.eyebrow}
                </p>
                <p className="mt-2.5 text-[18px] font-semibold leading-tight text-white/92">
                  {emptyState.title}
                </p>
                <p className="mt-2 text-[13px] leading-6 text-white/60">
                  {emptyState.description}
                </p>
                <p className="mt-3 text-[11px] leading-5 text-white/34">
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
              onInit={setFlowInstance}
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
              isValidConnection={isValidConnection}
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

        {connectHintLabel ? (
          <div className="pointer-events-none absolute right-4 top-4 z-30">
            <div className="rounded-full border border-white/10 bg-black/65 px-3 py-1 text-[11px] font-medium text-white/84 shadow-[0_12px_28px_-20px_rgba(0,0,0,0.72)] backdrop-blur-md">
              {connectHintLabel}
            </div>
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
  return state.direction === "upstream"
    ? "Add Upstream Agent"
    : "Add Downstream Agent";
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
        className="fixed z-[210] w-[min(24rem,calc(100vw-1.5rem))] rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,19,0.98),rgba(12,12,13,0.96))] p-4 shadow-[0_28px_80px_-40px_rgba(0,0,0,0.92)] backdrop-blur-xl"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-white/90">{title}</p>
            <p className="mt-1 text-[11px] text-white/44">
              Choose a role and optionally set a display name.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[11px] text-white/46 transition-colors hover:bg-white/[0.06] hover:text-white/84"
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
            className="h-10 w-full rounded-[0.9rem] border border-white/10 bg-black/18 px-3 text-[13px] text-white placeholder:text-white/30 focus:border-white/24 focus:outline-none"
          />
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-[0.9rem] border border-white/10 bg-black/14 p-2 scrollbar-none">
            {loadingRoles ? (
              <p className="px-2 py-3 text-[12px] text-white/42">
                Loading roles...
              </p>
            ) : filteredRoles.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-white/42">
                No roles match your search.
              </p>
            ) : (
              filteredRoles.map((role) => (
                <button
                  key={role.name}
                  type="button"
                  onClick={() => onSelectRole(role.name)}
                  className={cn(
                    "w-full rounded-[0.85rem] border px-3 py-2.5 text-left transition-colors",
                    selectedRoleName === role.name
                      ? "border-white/18 bg-white/[0.08]"
                      : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]",
                  )}
                >
                  <div className="text-[13px] font-medium text-white/88">
                    {role.name}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-white/46">
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
            className="h-10 w-full rounded-[0.9rem] border border-white/10 bg-black/18 px-3 text-[13px] text-white placeholder:text-white/30 focus:border-white/24 focus:outline-none"
          />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium text-white/58 transition-colors hover:text-white/86"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedRoleName || submitting}
            onClick={onSubmit}
            className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving..." : title}
          </button>
        </div>
      </div>
    </ViewportPortal>
  );
}
