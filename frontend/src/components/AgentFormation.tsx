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
import { AgentEdge } from "@/components/AgentEdge";
import { AgentGroupNode } from "@/components/AgentGroupNode";
import { AgentNode } from "@/components/AgentNode";
import { AgentTooltip } from "@/components/AgentTooltip";
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
  useAgentFormationRuntime,
  useAgentNodesRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { terminateNode } from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

const FORMATION_NODE_PREFIX = "formation:";
const FORMATION_MIN_WIDTH = 320;
const FORMATION_MIN_HEIGHT = 140;
const FORMATION_HEADER_HEIGHT = 52;
const FORMATION_SIDE_PADDING = 24;
const FORMATION_BOTTOM_PADDING = 24;
const NODE_EXIT_MS = 320;
const EDGE_EXIT_MS = 220;
const VIEWPORT_FIT_PADDING = 0.3;
const VIEWPORT_FIT_MAX_ZOOM = 1;
const VIEWPORT_MIN_ZOOM = 0.05;
const VIEWPORT_MAX_ZOOM = 6;

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  formationGroup: AgentGroupNode,
};

const edgeTypes: EdgeTypes = {
  animated: AgentEdge,
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
  formationId: string | null;
  label: string;
  width: number;
  connections: string[];
}

interface StaticFormationDescriptor {
  id: string;
  parentFormationId: string | null;
  name: string | null;
  goal: string;
}

interface StructuralFormation {
  structureKey: string;
  agents: StaticAgentDescriptor[];
  formations: StaticFormationDescriptor[];
}

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  node_type: NodeType;
  formation_id: string | null;
  state: AgentState;
  shortId: string;
  name: string | null;
  role_name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
  leaving: boolean;
}

interface FormationGroupData extends Record<string, unknown> {
  formationId: string;
  label: string;
  goal: string;
  depth: number;
  nodeCount: number;
  childFormationCount: number;
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

interface FormationLayoutNode {
  kind: "formation";
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  data: FormationGroupData;
}

type WorkspaceLayoutNode = AgentLayoutNode | FormationLayoutNode;

interface FormationSubtreeLayout {
  width: number;
  height: number;
  data: FormationGroupData;
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

const formationLayoutCache = new Map<string, LayoutCache>();
const MAX_LAYOUT_CACHE_SIZE = 20;

function useTransientFormationElements(
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
          className: cn(node.className, "agent-formation-node-present"),
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
          className: cn(node.className, "agent-formation-node-leaving"),
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

function getFormationNodeId(formationId: string): string {
  return `${FORMATION_NODE_PREFIX}${formationId}`;
}

function getFormationDisplayName(formation: StaticFormationDescriptor): string {
  const trimmed = formation.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : formation.id.slice(0, 8);
}

function getCachedLayoutFormation(
  structuralFormation: StructuralFormation,
): LayoutCache {
  const cached = formationLayoutCache.get(structuralFormation.structureKey);
  if (cached) {
    return cached;
  }

  const agentsById = new Map(
    structuralFormation.agents.map((agent) => [agent.id, agent] as const),
  );
  const formationsById = new Map(
    structuralFormation.formations.map(
      (formation) => [formation.id, formation] as const,
    ),
  );
  const formationChildren = new Map<string | null, string[]>();
  const formationNodeIds = new Map<string, string[]>();
  const formationDepths = new Map<string, number>();

  formationChildren.set(null, []);
  for (const formation of structuralFormation.formations) {
    formationChildren.set(formation.id, []);
    formationNodeIds.set(formation.id, []);
  }

  for (const formation of structuralFormation.formations) {
    const parentId =
      formation.parentFormationId &&
      formationsById.has(formation.parentFormationId)
        ? formation.parentFormationId
        : null;
    const siblings = formationChildren.get(parentId) ?? [];
    siblings.push(formation.id);
    formationChildren.set(parentId, siblings);
  }

  for (const agent of structuralFormation.agents) {
    const formationId =
      agent.formationId && formationsById.has(agent.formationId)
        ? agent.formationId
        : null;
    if (!formationId) {
      continue;
    }
    const nodeIds = formationNodeIds.get(formationId) ?? [];
    nodeIds.push(agent.id);
    formationNodeIds.set(formationId, nodeIds);
  }

  const sortFormationIds = (ids: string[]) =>
    [...ids].sort((leftId, rightId) => {
      const left = formationsById.get(leftId);
      const right = formationsById.get(rightId);
      const leftLabel = left ? getFormationDisplayName(left) : leftId;
      const rightLabel = right ? getFormationDisplayName(right) : rightId;
      return (
        leftLabel.localeCompare(rightLabel) || leftId.localeCompare(rightId)
      );
    });

  for (const [parentId, childIds] of formationChildren) {
    formationChildren.set(parentId, sortFormationIds(childIds));
  }

  for (const [formationId, nodeIds] of formationNodeIds) {
    formationNodeIds.set(
      formationId,
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

  const getFormationDepth = (formationId: string): number => {
    const cachedDepth = formationDepths.get(formationId);
    if (typeof cachedDepth === "number") {
      return cachedDepth;
    }

    const formation = formationsById.get(formationId);
    if (
      !formation ||
      !formation.parentFormationId ||
      !formationsById.has(formation.parentFormationId)
    ) {
      formationDepths.set(formationId, 0);
      return 0;
    }

    const depth = getFormationDepth(formation.parentFormationId) + 1;
    formationDepths.set(formationId, depth);
    return depth;
  };

  const getRootFormationId = (formationId: string): string => {
    let current = formationId;
    while (true) {
      const formation = formationsById.get(current);
      if (
        !formation?.parentFormationId ||
        !formationsById.has(formation.parentFormationId)
      ) {
        return current;
      }
      current = formation.parentFormationId;
    }
  };

  const getDirectChildFormationId = (
    parentFormationId: string,
    targetFormationId: string,
  ): string | null => {
    let current = targetFormationId;

    while (true) {
      const formation = formationsById.get(current);
      if (
        !formation?.parentFormationId ||
        !formationsById.has(formation.parentFormationId)
      ) {
        return null;
      }
      if (formation.parentFormationId === parentFormationId) {
        return current;
      }
      current = formation.parentFormationId;
    }
  };

  const getContainerItemId = (
    containerFormationId: string | null,
    agent: StaticAgentDescriptor,
  ): string | null => {
    const formationId =
      agent.formationId && formationsById.has(agent.formationId)
        ? agent.formationId
        : null;

    if (containerFormationId === null) {
      if (!formationId) {
        return agent.id;
      }
      return getFormationNodeId(getRootFormationId(formationId));
    }

    if (formationId === containerFormationId) {
      return agent.id;
    }

    if (!formationId) {
      return null;
    }

    const childFormationId = getDirectChildFormationId(
      containerFormationId,
      formationId,
    );
    return childFormationId ? getFormationNodeId(childFormationId) : null;
  };

  const allAgentEdges = structuralFormation.agents.flatMap((agent) =>
    agent.connections
      .filter((targetId) => agentsById.has(targetId))
      .map((targetId) => ({
        id: `${agent.id}->${targetId}`,
        source: agent.id,
        target: targetId,
      })),
  );

  const getContainerEdges = (containerFormationId: string | null) => {
    const edgeSet = new Set<string>();
    const edges: Array<{ id: string; source: string; target: string }> = [];

    for (const edge of allAgentEdges) {
      const sourceAgent = agentsById.get(edge.source);
      const targetAgent = agentsById.get(edge.target);
      if (!sourceAgent || !targetAgent) {
        continue;
      }

      const sourceItemId = getContainerItemId(
        containerFormationId,
        sourceAgent,
      );
      const targetItemId = getContainerItemId(
        containerFormationId,
        targetAgent,
      );
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
  const countSubtreeNodes = (formationId: string): number => {
    const cachedCount = subtreeNodeCountCache.get(formationId);
    if (typeof cachedCount === "number") {
      return cachedCount;
    }

    const directCount = formationNodeIds.get(formationId)?.length ?? 0;
    const total =
      directCount +
      (formationChildren.get(formationId) ?? []).reduce(
        (sum, childFormationId) => sum + countSubtreeNodes(childFormationId),
        0,
      );

    subtreeNodeCountCache.set(formationId, total);
    return total;
  };

  const buildFormationLayout = (
    formationId: string,
  ): FormationSubtreeLayout => {
    const formation = formationsById.get(formationId);
    const childFormationIds = formationChildren.get(formationId) ?? [];
    const directNodeIds = formationNodeIds.get(formationId) ?? [];

    const childLayouts = new Map(
      childFormationIds.map((childFormationId) => [
        childFormationId,
        buildFormationLayout(childFormationId),
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
      ...childFormationIds.map((childFormationId) => {
        const childLayout = childLayouts.get(childFormationId);
        return {
          id: getFormationNodeId(childFormationId),
          position: { x: 0, y: 0 },
          width: childLayout?.width ?? FORMATION_MIN_WIDTH,
          height: childLayout?.height ?? FORMATION_MIN_HEIGHT,
          data: {},
        } satisfies FlowNode;
      }),
    ];

    const rawEdges: FlowEdge[] = getContainerEdges(formationId).map((edge) => ({
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
    let maxRight = FORMATION_SIDE_PADDING;
    let maxBottom = FORMATION_HEADER_HEIGHT;

    for (const nodeId of directNodeIds) {
      const agent = agentsById.get(nodeId);
      if (!agent) {
        continue;
      }

      const position = positions.get(nodeId) ?? { x: 0, y: 0 };
      const relativePosition = {
        x: position.x + FORMATION_SIDE_PADDING,
        y: position.y + FORMATION_HEADER_HEIGHT,
      };

      maxRight = Math.max(maxRight, relativePosition.x + agent.width);
      maxBottom = Math.max(maxBottom, relativePosition.y + AGENT_NODE_HEIGHT);

      nodes.push({
        kind: "agent",
        id: nodeId,
        parentId: getFormationNodeId(formationId),
        position: relativePosition,
        width: agent.width,
        height: AGENT_NODE_HEIGHT,
      });
    }

    for (const childFormationId of childFormationIds) {
      const childLayout = childLayouts.get(childFormationId);
      const childFormation = formationsById.get(childFormationId);
      if (!childLayout || !childFormation) {
        continue;
      }

      const childNodeId = getFormationNodeId(childFormationId);
      const position = positions.get(childNodeId) ?? { x: 0, y: 0 };
      const relativePosition = {
        x: position.x + FORMATION_SIDE_PADDING,
        y: position.y + FORMATION_HEADER_HEIGHT,
      };

      maxRight = Math.max(maxRight, relativePosition.x + childLayout.width);
      maxBottom = Math.max(maxBottom, relativePosition.y + childLayout.height);

      nodes.push({
        kind: "formation",
        id: childNodeId,
        parentId: getFormationNodeId(formationId),
        position: relativePosition,
        width: childLayout.width,
        height: childLayout.height,
        data: childLayout.data,
      });
      nodes.push(...childLayout.nodes);
    }

    return {
      width: Math.max(FORMATION_MIN_WIDTH, maxRight + FORMATION_SIDE_PADDING),
      height: Math.max(
        FORMATION_MIN_HEIGHT,
        maxBottom + FORMATION_BOTTOM_PADDING,
      ),
      data: {
        formationId,
        label: formation
          ? getFormationDisplayName(formation)
          : formationId.slice(0, 8),
        goal: formation?.goal ?? "",
        depth: getFormationDepth(formationId),
        nodeCount: countSubtreeNodes(formationId),
        childFormationCount: childFormationIds.length,
        leaving: false,
      },
      nodes,
    };
  };

  const rootFormationIds = formationChildren.get(null) ?? [];
  const rootFormationLayouts = new Map(
    rootFormationIds.map((formationId) => [
      formationId,
      buildFormationLayout(formationId),
    ]),
  );

  const topLevelAgentIds = structuralFormation.agents
    .filter(
      (agent) => !agent.formationId || !formationsById.has(agent.formationId),
    )
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
    ...rootFormationIds.map((formationId) => {
      const layout = rootFormationLayouts.get(formationId);
      return {
        id: getFormationNodeId(formationId),
        position: { x: 0, y: 0 },
        width: layout?.width ?? FORMATION_MIN_WIDTH,
        height: layout?.height ?? FORMATION_MIN_HEIGHT,
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

  for (const formationId of rootFormationIds) {
    const formationLayout = rootFormationLayouts.get(formationId);
    if (!formationLayout) {
      continue;
    }

    nodes.push({
      kind: "formation",
      id: getFormationNodeId(formationId),
      position: topLevelPositions.get(getFormationNodeId(formationId)) ?? {
        x: 0,
        y: 0,
      },
      width: formationLayout.width,
      height: formationLayout.height,
      data: formationLayout.data,
    });
    nodes.push(...formationLayout.nodes);
  }

  const nextLayout = {
    structureKey: structuralFormation.structureKey,
    nodes,
    edges: allAgentEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "animated" as const,
    })),
  } satisfies LayoutCache;

  formationLayoutCache.set(structuralFormation.structureKey, nextLayout);
  if (formationLayoutCache.size > MAX_LAYOUT_CACHE_SIZE) {
    const oldestKey = formationLayoutCache.keys().next().value;
    if (typeof oldestKey === "string") {
      formationLayoutCache.delete(oldestKey);
    }
  }

  return nextLayout;
}

export function AgentFormation() {
  const { agents } = useAgentNodesRuntime();
  const { formations } = useAgentFormationRuntime();
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

  const structuralFormation = useMemo(() => {
    const structuralAgents = Array.from(agents.values()).map((agent) => {
      const label = getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
      });

      return {
        id: agent.id,
        nodeType: agent.node_type,
        formationId: agent.formation_id,
        label,
        width: getAgentNodeWidth(label),
        connections: [...agent.connections].sort(),
      } satisfies StaticAgentDescriptor;
    });

    const structuralFormations = Array.from(formations.values()).map(
      (formation) => ({
        id: formation.id,
        parentFormationId: formation.parent_formation_id,
        name: formation.name,
        goal: formation.goal,
      }),
    );

    const agentKey = structuralAgents
      .map(
        (agent) =>
          `${agent.id}:${agent.nodeType}:${agent.formationId ?? "null"}:${agent.label}:${agent.width}:${agent.connections.join(",")}`,
      )
      .sort()
      .join("|");

    const formationKey = structuralFormations
      .map(
        (formation) =>
          `${formation.id}:${formation.parentFormationId ?? "null"}:${formation.name ?? ""}:${formation.goal}`,
      )
      .sort()
      .join("|");

    return {
      structureKey: `${agentKey}::${formationKey}`,
      agents: structuralAgents,
      formations: structuralFormations,
    } satisfies StructuralFormation;
  }, [agents, formations]);

  const layoutFormation = useMemo(
    () => getCachedLayoutFormation(structuralFormation),
    [structuralFormation],
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
        formation_id: agent.formation_id,
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
    const nodes: FlowNode[] = layoutFormation.nodes.flatMap<FlowNode>(
      (layoutNode) => {
        if (layoutNode.kind === "formation") {
          return [
            {
              id: layoutNode.id,
              type: "formationGroup",
              parentId: layoutNode.parentId,
              position: layoutNode.position,
              width: layoutNode.width,
              height: layoutNode.height,
              data: layoutNode.data,
              draggable: false,
              selectable: false,
              connectable: false,
              className:
                "agent-formation-group-shell !border-none !bg-transparent !shadow-none",
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
            className: "agent-formation-node-shell",
          } satisfies FlowNode,
        ];
      },
    );

    const edges = layoutFormation.edges.map((edge) => {
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
      structureKey: layoutFormation.structureKey,
    };
  }, [activeEdgeMessages, layoutFormation, transientData]);

  const { nodes: animatedNodes, edges: animatedEdges } =
    useTransientFormationElements(nodes, edges);

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
          padding: VIEWPORT_FIT_PADDING,
          maxZoom: VIEWPORT_FIT_MAX_ZOOM,
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
                Loading agent formation...
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
            zoomOnPinch
            minZoom={VIEWPORT_MIN_ZOOM}
            maxZoom={VIEWPORT_MAX_ZOOM}
            className="bg-formation-bg"
          >
            <Background color="var(--formation-grid)" gap={32} size={0.8} />
            <svg aria-hidden="true" focusable="false">
              <defs>
                <linearGradient
                  id="agent-formation-edge-flow"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--formation-edge)"
                    stopOpacity="0.2"
                  />
                  <stop
                    offset="50%"
                    stopColor="var(--formation-edge-active)"
                    stopOpacity="0.94"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--formation-edge)"
                    stopOpacity="0.2"
                  />
                </linearGradient>
                <radialGradient
                  id="agent-formation-edge-pulse"
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--formation-edge-active)"
                    stopOpacity="1"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--formation-edge-active)"
                    stopOpacity="0.2"
                  />
                </radialGradient>
                <filter
                  id="agent-formation-edge-glow"
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

      <AgentTooltip
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
