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
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { AnimatedMessageEdge } from "@/components/AgentGraphEdge";
import { AgentGraphNode } from "@/components/AgentGraphNode";
import { AgentGraphTooltip } from "@/components/AgentGraphTooltip";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import {
  AGENT_NODE_MIN_WIDTH,
  AGENT_NODE_HEIGHT,
  getAgentNodeWidth,
  getLayoutedElements,
} from "@/lib/layout";
import {
  useAgentActivityRuntime,
  useAgentNodesRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { terminateNode } from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

const nodeTypes: NodeTypes = {
  agent: AgentGraphNode,
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

interface LayoutCache {
  structureKey: string;
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: "animated";
  }>;
}

interface StructuralGraph {
  structureKey: string;
  rawNodes: Node[];
  rawEdges: Edge[];
}

interface GraphNodeData extends Record<string, unknown> {
  label: string;
  width: number;
  node_type: NodeType;
  state: AgentState;
  shortId: string;
  name: string | null;
  role_name: string | null;
  latestTodo: string | null;
  selected: boolean;
  toolCall: string | null;
}

const graphLayoutCache = new Map<string, LayoutCache>();
const MAX_LAYOUT_CACHE_SIZE = 20;

function getCachedLayoutGraph(structuralGraph: StructuralGraph): LayoutCache {
  const cached = graphLayoutCache.get(structuralGraph.structureKey);
  if (cached) {
    return cached;
  }

  const layout = getLayoutedElements(
    structuralGraph.rawNodes,
    structuralGraph.rawEdges,
  );

  const nextLayout = {
    structureKey: structuralGraph.structureKey,
    nodes: layout.nodes.map((node) => ({
      id: node.id,
      position: node.position,
      width: typeof node.width === "number" ? node.width : AGENT_NODE_MIN_WIDTH,
      height: typeof node.height === "number" ? node.height : AGENT_NODE_HEIGHT,
    })),
    edges: layout.edges.map((edge) => ({
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
      const edgeId = [msg.fromId, msg.toId].sort().join("-");
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
    const edgeSet = new Set<string>();
    const structuralEdges: Array<{
      id: string;
      source: string;
      target: string;
    }> = [];
    const structuralNodes: Array<{
      id: string;
      nodeType: NodeType;
      label: string;
      width: number;
    }> = [];
    const structureNodeKeys: string[] = [];

    for (const [id, agent] of agents) {
      const label = getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
      });
      const width = getAgentNodeWidth(label);
      structuralNodes.push({
        id,
        nodeType: agent.node_type,
        label,
        width,
      });
      structureNodeKeys.push(
        `${id}:${agent.node_type}:${label}:${width}:${[...agent.connections].sort().join(",")}`,
      );

      for (const connId of agent.connections) {
        const edgeId = [id, connId].sort().join("-");
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          structuralEdges.push({
            id: edgeId,
            source: id,
            target: connId,
          });
        }
      }
    }

    const structureKey = `${structureNodeKeys.sort().join("|")}::${Array.from(
      edgeSet,
    )
      .sort()
      .join("|")}`;

    const rawNodes: Node[] = structuralNodes.map(
      ({ id, nodeType, label, width }) => ({
        id,
        type: "agent",
        position: { x: 0, y: 0 },
        width,
        height: AGENT_NODE_HEIGHT,
        data: {
          label,
          node_type: nodeType,
        },
      }),
    );

    const rawEdges: Edge[] = structuralEdges.map(({ id, source, target }) => ({
      id,
      source,
      target,
      type: "animated",
      animated: false,
    }));

    return {
      structureKey,
      rawNodes,
      rawEdges,
    } satisfies StructuralGraph;
  }, [agents]);

  const layoutGraph = useMemo(
    () => getCachedLayoutGraph(structuralGraph),
    [structuralGraph],
  );

  const transientData = useMemo(() => {
    const data = new Map<string, GraphNodeData>();

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
        state: agent.state,
        shortId: id.slice(0, 8),
        name: agent.name,
        role_name: agent.role_name,
        latestTodo: agent.todos[agent.todos.length - 1]?.text ?? null,
        selected: id === selectedAgentId,
        toolCall: activeToolCalls.get(id) ?? null,
      });
    }

    return data;
  }, [agents, selectedAgentId, activeToolCalls]);

  const { nodes, edges, structureKey } = useMemo(() => {
    const nodes: Node[] = layoutGraph.nodes.flatMap((layoutNode) => {
      const data = transientData.get(layoutNode.id);
      if (!data) {
        return [];
      }

      return [
        {
          id: layoutNode.id,
          type: "agent",
          position: layoutNode.position,
          width: layoutNode.width,
          height: layoutNode.height,
          data,
        } satisfies Node,
      ];
    });

    const edges = layoutGraph.edges.map((edge) => {
      const activeMessage = activeEdgeMessages.get(edge.id);
      return {
        ...edge,
        data: {
          active: !!activeMessage,
          flowDirection: activeMessage
            ? activeMessage.fromId === edge.source &&
              activeMessage.toId === edge.target
              ? "forward"
              : "reverse"
            : null,
        },
        animated: false,
      } satisfies Edge;
    });

    return {
      nodes,
      edges,
      structureKey: layoutGraph.structureKey,
    };
  }, [activeEdgeMessages, layoutGraph, transientData]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      selectAgent(node.id);
    },
    [selectAgent],
  );

  const onNodeMouseEnter: NodeMouseHandler = useCallback((event, node) => {
    const mouseEvent = event as unknown as MouseEvent;
    setTooltip({
      agentId: node.id,
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
    });
  }, []);

  const onNodeMouseMove: NodeMouseHandler = useCallback((event, node) => {
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
    if (!flowInstance || nodes.length === 0) return;
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
  }, [flowInstance, nodes.length, structureKey]);

  useEffect(() => {
    if (!flowInstance || !containerRef.current || nodes.length === 0) return;

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
  }, [flowInstance, nodes.length]);

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
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <Network className="mx-auto size-8 text-primary/65" />
              <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
              <p className="text-sm text-muted-foreground">
                Loading agent forest...
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
