import {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { AnimatedMessageEdge } from "@/components/AgentGraphEdge";
import { AgentGraphGroupNode } from "@/components/AgentGraphGroupNode";
import { AgentGraphNode } from "@/components/AgentGraphNode";
import { AgentGraphTooltip } from "@/components/AgentGraphTooltip";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import {
  AGENT_NODE_HEIGHT,
  AGENT_NODE_MIN_WIDTH,
  getAgentNodeWidth,
  getLayoutedElements,
} from "@/lib/layout";
import { cn } from "@/lib/utils";
import {
  useAgentActivityRuntime,
  useAgentGraphRuntime,
  useAgentNodesRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { terminateNode } from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

const GRAPH_NODE_PREFIX = "graph:";
const GRAPH_MIN_WIDTH = 320;
const GRAPH_MIN_HEIGHT = 140;
const GRAPH_HEADER_HEIGHT = 52;
const GRAPH_SIDE_PADDING = 24;
const GRAPH_BOTTOM_PADDING = 24;
const NODE_EXIT_MS = 320;
const EDGE_EXIT_MS = 220;

const nodeTypes: NodeTypes = {
  agent: AgentGraphNode,
  graphGroup: AgentGraphGroupNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedMessageEdge,
};

interface TooltipData {
  agentId: string;
  x: number;
  y: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  agentId: string | null;
}

interface StaticAgentDescriptor {
  id: string;
  nodeType: NodeType;
  graphId: string | null;
  label: string;
  width: number;
  connections: string[];
}

interface StaticGraphDescriptor {
  id: string;
  parentGraphId: string | null;
  name: string | null;
  goal: string;
}

interface StructuralGraph {
  structureKey: string;
  agents: StaticAgentDescriptor[];
  graphs: StaticGraphDescriptor[];
}

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  node_type: NodeType;
  graph_id: string | null;
  state: AgentState;
  shortId: string;
  name: string | null;
  role_name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
  leaving: boolean;
}

interface GraphGroupData extends Record<string, unknown> {
  graphId: string;
  label: string;
  goal: string;
  depth: number;
  nodeCount: number;
  childGraphCount: number;
  leaving: boolean;
}

interface AgentLayoutNode {
  kind: "agent";
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

interface GraphLayoutNode {
  kind: "graph";
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  data: GraphGroupData;
}

type WorkspaceLayoutNode = AgentLayoutNode | GraphLayoutNode;

interface GraphSubtreeLayout {
  width: number;
  height: number;
  data: GraphGroupData;
  nodes: WorkspaceLayoutNode[];
}

interface LayoutCache {
  structureKey: string;
  nodes: WorkspaceLayoutNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: "animated";
  }>;
}

const graphLayoutCache = new Map<string, LayoutCache>();
const MAX_LAYOUT_CACHE_SIZE = 20;

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
      const nextIds = new Set(edges.map((edge) => edge.id));
      const prevMap = new Map(prev.map((edge) => [edge.id, edge] as const));
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

function getGraphNodeId(graphId: string): string {
  return `${GRAPH_NODE_PREFIX}${graphId}`;
}

function getGraphDisplayName(graph: StaticGraphDescriptor): string {
  const trimmed = graph.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : graph.id.slice(0, 8);
}

function getCachedLayoutGraph(structuralGraph: StructuralGraph): LayoutCache {
  const cached = graphLayoutCache.get(structuralGraph.structureKey);
  if (cached) {
    return cached;
  }

  const agentsById = new Map(
    structuralGraph.agents.map((agent) => [agent.id, agent] as const),
  );
  const graphsById = new Map(
    structuralGraph.graphs.map((graph) => [graph.id, graph] as const),
  );
  const graphChildren = new Map<string | null, string[]>();
  const graphNodeIds = new Map<string, string[]>();
  const graphDepths = new Map<string, number>();

  graphChildren.set(null, []);
  for (const graph of structuralGraph.graphs) {
    graphChildren.set(graph.id, []);
    graphNodeIds.set(graph.id, []);
  }

  for (const graph of structuralGraph.graphs) {
    const parentId =
      graph.parentGraphId && graphsById.has(graph.parentGraphId)
        ? graph.parentGraphId
        : null;
    const siblings = graphChildren.get(parentId) ?? [];
    siblings.push(graph.id);
    graphChildren.set(parentId, siblings);
  }

  for (const agent of structuralGraph.agents) {
    const graphId =
      agent.graphId && graphsById.has(agent.graphId) ? agent.graphId : null;
    if (!graphId) {
      continue;
    }
    const nodeIds = graphNodeIds.get(graphId) ?? [];
    nodeIds.push(agent.id);
    graphNodeIds.set(graphId, nodeIds);
  }

  const sortGraphIds = (ids: string[]) =>
    [...ids].sort((leftId, rightId) => {
      const left = graphsById.get(leftId);
      const right = graphsById.get(rightId);
      const leftLabel = left ? getGraphDisplayName(left) : leftId;
      const rightLabel = right ? getGraphDisplayName(right) : rightId;
      return (
        leftLabel.localeCompare(rightLabel) || leftId.localeCompare(rightId)
      );
    });

  for (const [parentId, childIds] of graphChildren) {
    graphChildren.set(parentId, sortGraphIds(childIds));
  }

  for (const [graphId, nodeIds] of graphNodeIds) {
    graphNodeIds.set(
      graphId,
      [...nodeIds].sort((leftId, rightId) => {
        const left = agentsById.get(leftId);
        const right = agentsById.get(rightId);
        const leftLabel = left?.label ?? leftId;
        const rightLabel = right?.label ?? rightId;
        return (
          leftLabel.localeCompare(rightLabel) || leftId.localeCompare(rightId)
        );
      }),
    );
  }

  const getGraphDepth = (graphId: string): number => {
    const cachedDepth = graphDepths.get(graphId);
    if (typeof cachedDepth === "number") {
      return cachedDepth;
    }

    const graph = graphsById.get(graphId);
    if (
      !graph ||
      !graph.parentGraphId ||
      !graphsById.has(graph.parentGraphId)
    ) {
      graphDepths.set(graphId, 0);
      return 0;
    }

    const depth = getGraphDepth(graph.parentGraphId) + 1;
    graphDepths.set(graphId, depth);
    return depth;
  };

  const getRootGraphId = (graphId: string): string => {
    let current = graphId;
    while (true) {
      const graph = graphsById.get(current);
      if (!graph?.parentGraphId || !graphsById.has(graph.parentGraphId)) {
        return current;
      }
      current = graph.parentGraphId;
    }
  };

  const getDirectChildGraphId = (
    parentGraphId: string,
    targetGraphId: string,
  ): string | null => {
    let current = targetGraphId;

    while (true) {
      const graph = graphsById.get(current);
      if (!graph?.parentGraphId || !graphsById.has(graph.parentGraphId)) {
        return null;
      }
      if (graph.parentGraphId === parentGraphId) {
        return current;
      }
      current = graph.parentGraphId;
    }
  };

  const getContainerItemId = (
    containerGraphId: string | null,
    agent: StaticAgentDescriptor,
  ): string | null => {
    const graphId =
      agent.graphId && graphsById.has(agent.graphId) ? agent.graphId : null;

    if (containerGraphId === null) {
      if (!graphId) {
        return agent.id;
      }
      return getGraphNodeId(getRootGraphId(graphId));
    }

    if (graphId === containerGraphId) {
      return agent.id;
    }

    if (!graphId) {
      return null;
    }

    const childGraphId = getDirectChildGraphId(containerGraphId, graphId);
    return childGraphId ? getGraphNodeId(childGraphId) : null;
  };

  const allAgentEdges = structuralGraph.agents.flatMap((agent) =>
    agent.connections
      .filter((targetId) => agentsById.has(targetId))
      .map((targetId) => ({
        id: `${agent.id}->${targetId}`,
        source: agent.id,
        target: targetId,
      })),
  );

  const getContainerEdges = (containerGraphId: string | null) => {
    const edgeSet = new Set<string>();
    const edges: Array<{ id: string; source: string; target: string }> = [];

    for (const edge of allAgentEdges) {
      const sourceAgent = agentsById.get(edge.source);
      const targetAgent = agentsById.get(edge.target);
      if (!sourceAgent || !targetAgent) {
        continue;
      }

      const sourceItemId = getContainerItemId(containerGraphId, sourceAgent);
      const targetItemId = getContainerItemId(containerGraphId, targetAgent);
      if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
        continue;
      }

      const edgeId = `${sourceItemId}->${targetItemId}`;
      if (edgeSet.has(edgeId)) {
        continue;
      }

      edgeSet.add(edgeId);
      edges.push({
        id: edgeId,
        source: sourceItemId,
        target: targetItemId,
      });
    }

    return edges;
  };

  const subtreeNodeCountCache = new Map<string, number>();
  const countSubtreeNodes = (graphId: string): number => {
    const cachedCount = subtreeNodeCountCache.get(graphId);
    if (typeof cachedCount === "number") {
      return cachedCount;
    }

    const directCount = graphNodeIds.get(graphId)?.length ?? 0;
    const total =
      directCount +
      (graphChildren.get(graphId) ?? []).reduce(
        (sum, childGraphId) => sum + countSubtreeNodes(childGraphId),
        0,
      );

    subtreeNodeCountCache.set(graphId, total);
    return total;
  };

  const buildGraphLayout = (graphId: string): GraphSubtreeLayout => {
    const graph = graphsById.get(graphId);
    const childGraphIds = graphChildren.get(graphId) ?? [];
    const directNodeIds = graphNodeIds.get(graphId) ?? [];

    const childLayouts = new Map(
      childGraphIds.map((childGraphId) => [
        childGraphId,
        buildGraphLayout(childGraphId),
      ]),
    );

    const rawNodes: FlowNode[] = [
      ...directNodeIds.map((nodeId) => {
        const agent = agentsById.get(nodeId);
        return {
          id: nodeId,
          position: { x: 0, y: 0 },
          width: agent?.width ?? AGENT_NODE_MIN_WIDTH,
          height: AGENT_NODE_HEIGHT,
          data: {},
        } satisfies FlowNode;
      }),
      ...childGraphIds.map((childGraphId) => {
        const childLayout = childLayouts.get(childGraphId);
        return {
          id: getGraphNodeId(childGraphId),
          position: { x: 0, y: 0 },
          width: childLayout?.width ?? GRAPH_MIN_WIDTH,
          height: childLayout?.height ?? GRAPH_MIN_HEIGHT,
          data: {},
        } satisfies FlowNode;
      }),
    ];

    const rawEdges: FlowEdge[] = getContainerEdges(graphId).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "animated",
    }));

    const layouted =
      rawNodes.length > 0
        ? getLayoutedElements(rawNodes, rawEdges)
        : { nodes: [] as FlowNode[], edges: rawEdges };
    const positions = new Map(
      layouted.nodes.map((node) => [node.id, node.position] as const),
    );

    const nodes: WorkspaceLayoutNode[] = [];
    let maxRight = GRAPH_SIDE_PADDING;
    let maxBottom = GRAPH_HEADER_HEIGHT;

    for (const nodeId of directNodeIds) {
      const agent = agentsById.get(nodeId);
      if (!agent) {
        continue;
      }

      const position = positions.get(nodeId) ?? { x: 0, y: 0 };
      const relativePosition = {
        x: position.x + GRAPH_SIDE_PADDING,
        y: position.y + GRAPH_HEADER_HEIGHT,
      };

      maxRight = Math.max(maxRight, relativePosition.x + agent.width);
      maxBottom = Math.max(maxBottom, relativePosition.y + AGENT_NODE_HEIGHT);

      nodes.push({
        kind: "agent",
        id: nodeId,
        parentId: getGraphNodeId(graphId),
        position: relativePosition,
        width: agent.width,
        height: AGENT_NODE_HEIGHT,
      });
    }

    for (const childGraphId of childGraphIds) {
      const childLayout = childLayouts.get(childGraphId);
      const childGraph = graphsById.get(childGraphId);
      if (!childLayout || !childGraph) {
        continue;
      }

      const childNodeId = getGraphNodeId(childGraphId);
      const position = positions.get(childNodeId) ?? { x: 0, y: 0 };
      const relativePosition = {
        x: position.x + GRAPH_SIDE_PADDING,
        y: position.y + GRAPH_HEADER_HEIGHT,
      };

      maxRight = Math.max(maxRight, relativePosition.x + childLayout.width);
      maxBottom = Math.max(maxBottom, relativePosition.y + childLayout.height);

      nodes.push({
        kind: "graph",
        id: childNodeId,
        parentId: getGraphNodeId(graphId),
        position: relativePosition,
        width: childLayout.width,
        height: childLayout.height,
        data: childLayout.data,
      });
      nodes.push(...childLayout.nodes);
    }

    return {
      width: Math.max(GRAPH_MIN_WIDTH, maxRight + GRAPH_SIDE_PADDING),
      height: Math.max(GRAPH_MIN_HEIGHT, maxBottom + GRAPH_BOTTOM_PADDING),
      data: {
        graphId,
        label: graph ? getGraphDisplayName(graph) : graphId.slice(0, 8),
        goal: graph?.goal ?? "",
        depth: getGraphDepth(graphId),
        nodeCount: countSubtreeNodes(graphId),
        childGraphCount: childGraphIds.length,
        leaving: false,
      },
      nodes,
    };
  };

  const rootGraphIds = graphChildren.get(null) ?? [];
  const rootGraphLayouts = new Map(
    rootGraphIds.map((graphId) => [graphId, buildGraphLayout(graphId)]),
  );

  const topLevelAgentIds = structuralGraph.agents
    .filter((agent) => !agent.graphId || !graphsById.has(agent.graphId))
    .map((agent) => agent.id)
    .sort((leftId, rightId) => {
      const left = agentsById.get(leftId);
      const right = agentsById.get(rightId);
      const leftLabel = left?.label ?? leftId;
      const rightLabel = right?.label ?? rightId;
      return (
        leftLabel.localeCompare(rightLabel) || leftId.localeCompare(rightId)
      );
    });

  const topLevelRawNodes: FlowNode[] = [
    ...topLevelAgentIds.map((nodeId) => {
      const agent = agentsById.get(nodeId);
      return {
        id: nodeId,
        position: { x: 0, y: 0 },
        width: agent?.width ?? AGENT_NODE_MIN_WIDTH,
        height: AGENT_NODE_HEIGHT,
        data: {},
      } satisfies FlowNode;
    }),
    ...rootGraphIds.map((graphId) => {
      const layout = rootGraphLayouts.get(graphId);
      return {
        id: getGraphNodeId(graphId),
        position: { x: 0, y: 0 },
        width: layout?.width ?? GRAPH_MIN_WIDTH,
        height: layout?.height ?? GRAPH_MIN_HEIGHT,
        data: {},
      } satisfies FlowNode;
    }),
  ];

  const topLevelRawEdges: FlowEdge[] = getContainerEdges(null).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "animated",
  }));

  const topLevelLayout =
    topLevelRawNodes.length > 0
      ? getLayoutedElements(topLevelRawNodes, topLevelRawEdges)
      : { nodes: [] as FlowNode[], edges: topLevelRawEdges };
  const topLevelPositions = new Map(
    topLevelLayout.nodes.map((node) => [node.id, node.position] as const),
  );

  const nodes: WorkspaceLayoutNode[] = [];

  for (const nodeId of topLevelAgentIds) {
    const agent = agentsById.get(nodeId);
    if (!agent) {
      continue;
    }

    nodes.push({
      kind: "agent",
      id: nodeId,
      position: topLevelPositions.get(nodeId) ?? { x: 0, y: 0 },
      width: agent.width,
      height: AGENT_NODE_HEIGHT,
    });
  }

  for (const graphId of rootGraphIds) {
    const graphLayout = rootGraphLayouts.get(graphId);
    if (!graphLayout) {
      continue;
    }

    nodes.push({
      kind: "graph",
      id: getGraphNodeId(graphId),
      position: topLevelPositions.get(getGraphNodeId(graphId)) ?? {
        x: 0,
        y: 0,
      },
      width: graphLayout.width,
      height: graphLayout.height,
      data: graphLayout.data,
    });
    nodes.push(...graphLayout.nodes);
  }

  const nextLayout = {
    structureKey: structuralGraph.structureKey,
    nodes,
    edges: allAgentEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "animated" as const,
    })),
  } satisfies LayoutCache;

  graphLayoutCache.set(structuralGraph.structureKey, nextLayout);
  if (graphLayoutCache.size > MAX_LAYOUT_CACHE_SIZE) {
    const oldestKey = graphLayoutCache.keys().next().value;
    if (typeof oldestKey === "string") {
      graphLayoutCache.delete(oldestKey);
    }
  }

  return nextLayout;
}

export function AgentGraph() {
  const { agents } = useAgentNodesRuntime();
  const { graphs } = useAgentGraphRuntime();
  const { activeMessages, activeToolCalls } = useAgentActivityRuntime();
  const { selectedAgentId, selectAgent } = useAgentUI();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(
    null,
  );
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastViewportStructureKey = useRef<string | null>(null);
  const [tooltipSize, setTooltipSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

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

  const structuralGraph = useMemo(() => {
    const structuralAgents = Array.from(agents.values()).map((agent) => {
      const label = getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
      });

      return {
        id: agent.id,
        nodeType: agent.node_type,
        graphId: agent.graph_id,
        label,
        width: getAgentNodeWidth(label),
        connections: [...agent.connections].sort(),
      } satisfies StaticAgentDescriptor;
    });

    const structuralGraphs = Array.from(graphs.values()).map((graph) => ({
      id: graph.id,
      parentGraphId: graph.parent_graph_id,
      name: graph.name,
      goal: graph.goal,
    }));

    const agentKey = structuralAgents
      .map(
        (agent) =>
          `${agent.id}:${agent.nodeType}:${agent.graphId ?? "null"}:${agent.label}:${agent.width}:${agent.connections.join(",")}`,
      )
      .sort()
      .join("|");

    const graphKey = structuralGraphs
      .map(
        (graph) =>
          `${graph.id}:${graph.parentGraphId ?? "null"}:${graph.name ?? ""}:${graph.goal}`,
      )
      .sort()
      .join("|");

    return {
      structureKey: `${agentKey}::${graphKey}`,
      agents: structuralAgents,
      graphs: structuralGraphs,
    } satisfies StructuralGraph;
  }, [agents, graphs]);

  const layoutGraph = useMemo(
    () => getCachedLayoutGraph(structuralGraph),
    [structuralGraph],
  );

  const transientData = useMemo(() => {
    const data = new Map<string, AgentNodeData>();

    for (const [id, agent] of agents) {
      const label = getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
      });
      data.set(id, {
        label,
        width: getAgentNodeWidth(label),
        node_type: agent.node_type,
        graph_id: agent.graph_id,
        state: agent.state,
        shortId: id.slice(0, 8),
        name: agent.name,
        role_name: agent.role_name,
        latestTodo: agent.todos[agent.todos.length - 1]?.text ?? null,
        selected: id === selectedAgentId,
        toolCall: activeToolCalls.get(id) ?? null,
        leaving: false,
      });
    }

    return data;
  }, [agents, selectedAgentId, activeToolCalls]);

  const { nodes, edges, structureKey } = useMemo(() => {
    const nodes: FlowNode[] = layoutGraph.nodes.flatMap<FlowNode>(
      (layoutNode) => {
        if (layoutNode.kind === "graph") {
          return [
            {
              id: layoutNode.id,
              type: "graphGroup",
              parentId: layoutNode.parentId,
              position: layoutNode.position,
              width: layoutNode.width,
              height: layoutNode.height,
              data: layoutNode.data,
              draggable: false,
              selectable: false,
              connectable: false,
              className:
                "agent-graph-group-shell !border-none !bg-transparent !shadow-none",
            } satisfies FlowNode,
          ];
        }

        const data = transientData.get(layoutNode.id);
        if (!data) {
          return [];
        }

        return [
          {
            id: layoutNode.id,
            type: "agent",
            parentId: layoutNode.parentId,
            position: layoutNode.position,
            width: layoutNode.width,
            height: layoutNode.height,
            data,
            className: "agent-graph-node-shell",
          } satisfies FlowNode,
        ];
      },
    );

    const edges = layoutGraph.edges.map((edge) => {
      const activeMessage = activeEdgeMessages.get(edge.id);
      return {
        ...edge,
        data: {
          active: !!activeMessage,
          flowDirection: activeMessage ? "forward" : null,
          leaving: false,
        },
        animated: false,
      } satisfies FlowEdge;
    });

    return {
      nodes,
      edges,
      structureKey: layoutGraph.structureKey,
    };
  }, [activeEdgeMessages, layoutGraph, transientData]);

  const { nodes: animatedNodes, edges: animatedEdges } =
    useTransientGraphElements(nodes, edges);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (
        node.type !== "agent" ||
        (node.data as Record<string, unknown> | undefined)?.leaving
      ) {
        return;
      }
      selectAgent(node.id);
    },
    [selectAgent],
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback((event, node) => {
    if (node.type !== "agent") {
      return;
    }
    const mouseEvent = event as unknown as MouseEvent;
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
    const mouseEvent = event as unknown as MouseEvent;
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
    selectAgent(null);
  }, [selectAgent]);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        x: (event as globalThis.MouseEvent).clientX,
        y: (event as globalThis.MouseEvent).clientY,
        agentId: null,
      });
    },
    [],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    if (node.type !== "agent") {
      return;
    }
    const mouseEvent = event as unknown as globalThis.MouseEvent;
    mouseEvent.preventDefault();
    setContextMenu({
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
      agentId: node.id,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuItems = useMemo((): ContextMenuEntry[] => {
    if (!contextMenu) return [];
    const items: ContextMenuEntry[] = [];
    if (contextMenu.agentId) {
      const agentId = contextMenu.agentId;
      const node = agents.get(agentId);
      const isProtected = node?.node_type === "assistant";
      items.push({
        label: "Stop Agent",
        danger: true,
        disabled: isProtected,
        onClick: () => {
          if (!isProtected) {
            terminateNode(agentId).catch(() =>
              toast.error("Failed to terminate agent"),
            );
          }
        },
      });
    } else {
      items.push({
        label: "Fit View",
        disabled: !flowInstance,
        onClick: () => {
          flowInstance?.fitView({ padding: 0.3, duration: 350 });
        },
      });
      items.push({
        label: "Clear Selection",
        onClick: () => {
          selectAgent(null);
        },
      });
    }
    return items;
  }, [contextMenu, agents, flowInstance, selectAgent]);

  const tooltipAgent = tooltip ? agents.get(tooltip.agentId) : null;
  const tooltipToolCall =
    tooltip && tooltip.agentId
      ? (activeToolCalls.get(tooltip.agentId) ?? null)
      : null;

  useEffect(() => {
    if (!tooltip || !tooltipAgent) return;
    const raf = requestAnimationFrame(() => {
      const el = tooltipRef.current;
      if (!el) return;
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
    if (!flowInstance || animatedNodes.length === 0) return;
    if (lastViewportStructureKey.current === structureKey) return;
    const isInitialViewport = lastViewportStructureKey.current === null;
    lastViewportStructureKey.current = structureKey;

    const raf = requestAnimationFrame(() => {
      void flowInstance
        .fitView({
          padding: 0.3,
          maxZoom: 0.75,
          duration: isInitialViewport ? 0 : 250,
        })
        .catch(() => false);
    });

    return () => cancelAnimationFrame(raf);
  }, [flowInstance, animatedNodes.length, structureKey]);

  useEffect(() => {
    if (!flowInstance || !containerRef.current || animatedNodes.length === 0) {
      return;
    }

    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        void flowInstance
          .fitView({
            padding: 0.3,
            maxZoom: 0.75,
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
  }, [flowInstance, animatedNodes.length]);

  const tooltipStyle = useMemo(() => {
    if (!tooltip || typeof window === "undefined") return undefined;
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

  return (
    <div ref={containerRef} className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        {animatedNodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <Network className="mx-auto size-8 text-primary/65" />
              <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
              <p className="text-sm text-muted-foreground">
                Loading agent graph...
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
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            panOnDrag
            zoomOnScroll
            minZoom={0.3}
            maxZoom={1.8}
            className="bg-graph-bg"
          >
            <Background color="var(--graph-grid)" gap={32} size={0.8} />
            <svg aria-hidden="true" focusable="false">
              <defs>
                <linearGradient
                  id="agent-edge-flow"
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
                <radialGradient id="agent-edge-pulse" cx="50%" cy="50%" r="50%">
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
                  id="agent-edge-glow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="2.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>
          </ReactFlow>
        )}
      </div>

      <AgentGraphTooltip
        agent={tooltipAgent ?? null}
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
    </div>
  );
}
