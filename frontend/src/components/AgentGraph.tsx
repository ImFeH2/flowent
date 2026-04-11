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
  type Connection,
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
import { AgentNode } from "@/components/AgentNode";
import { AgentTooltip } from "@/components/AgentTooltip";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import {
  AGENT_NODE_HEIGHT,
  getAgentNodeWidth,
  getLayoutedElements,
} from "@/lib/layout";
import { cn } from "@/lib/utils";
import {
  useAgentActivityRuntime,
  useAgentNodesRuntime,
  useAgentTabsRuntime,
  useAgentUI,
} from "@/context/AgentContext";
import { createTabEdgeRequest, terminateNode } from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";
import type { AgentState, NodeType } from "@/types";

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

interface ContextMenuState {
  x: number;
  y: number;
  agentId: string | null;
}

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

export function AgentGraph() {
  const { agents } = useAgentNodesRuntime();
  const { tabs } = useAgentTabsRuntime();
  const { activeMessages, activeToolCalls } = useAgentActivityRuntime();
  const { activeTabId, selectedAgentId, selectAgent } = useAgentUI();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(
    null,
  );
  const [connecting, setConnecting] = useState(false);
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

  const transientData = useMemo(() => {
    const visibleAgentIds = new Set(visibleAgents.map((agent) => agent.id));
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
        selected: id === selectedAgentId,
        toolCall: activeToolCalls.get(id) ?? null,
        leaving: false,
        showIncomingHandle:
          Boolean(activeTabId) && (incomingAgentIds.has(id) || connecting),
        showOutgoingHandle:
          Boolean(activeTabId) &&
          (agent.connections.some((targetId) =>
            visibleAgentIds.has(targetId),
          ) ||
            connecting),
      });
    }

    return data;
  }, [
    activeTabId,
    activeToolCalls,
    connecting,
    selectedAgentId,
    visibleAgents,
  ]);

  const graphElements = useMemo(() => {
    const visibleAgentIds = new Set(visibleAgents.map((agent) => agent.id));
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

    const layouted =
      rawNodes.length > 0
        ? getLayoutedElements(rawNodes, baseEdges)
        : { nodes: [] as FlowNode[], edges: baseEdges };
    const positions = new Map(
      layouted.nodes.map((node) => [node.id, node.position] as const),
    );
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
        },
        animated: false,
      } satisfies FlowEdge;
    });

    return {
      nodes,
      edges,
      structureKey: `${activeTabId ?? "unassigned"}:${visibleAgents
        .map((agent) => {
          const data = transientData.get(agent.id);
          return `${agent.id}:${data?.label ?? ""}:${agent.connections
            .filter((targetId) => visibleAgentIds.has(targetId))
            .sort()
            .join(",")}`;
        })
        .sort()
        .join("|")}:${edges
        .map((edge) => edge.id)
        .sort()
        .join("|")}`,
    };
  }, [activeEdgeMessages, activeTabId, transientData, visibleAgents]);

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

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!activeTabId || !connection.source || !connection.target) {
        return;
      }
      void createTabEdgeRequest(
        activeTabId,
        connection.source,
        connection.target,
      ).catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to connect agents",
        );
      });
    },
    [activeTabId],
  );

  const onConnectStart = useCallback(() => {
    setConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setConnecting(false);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuItems = useMemo((): ContextMenuEntry[] => {
    if (!contextMenu) {
      return [];
    }
    const items: ContextMenuEntry[] = [];
    if (contextMenu.agentId) {
      const agentId = contextMenu.agentId;
      const contextAgent = agents.get(agentId) ?? null;
      items.push({
        label: contextAgent?.is_leader
          ? "Leader Follows Tab Lifecycle"
          : "Stop Agent",
        danger: !contextAgent?.is_leader,
        disabled: contextAgent?.is_leader,
        onClick: () => {
          terminateNode(agentId).catch(() =>
            toast.error("Failed to terminate agent"),
          );
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
  }, [agents, contextMenu, flowInstance, selectAgent]);

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
  }, [animatedNodes.length, flowInstance]);

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

  const emptyState = useMemo(() => {
    if (tabs.size === 0) {
      return {
        eyebrow: "Workspace",
        title: "No task tabs yet",
        description: "Create a task tab to start building an agent graph.",
        hint: "Use the + button in the tab strip to open your first workspace.",
      };
    }
    if (!activeTabId) {
      return {
        eyebrow: "Workspace",
        title: "Select a task tab",
        description: "Choose a tab to inspect and edit its agent graph.",
        hint: "Each tab keeps its own goal, nodes, and connections.",
      };
    }
    return {
      eyebrow: "Empty canvas",
      title: "This task tab is ready for its first agent",
      description:
        "Add agents, connect them, or ask Assistant to scaffold the graph.",
      hint: "Start with a worker, a reviewer, or another helper node.",
    };
  }, [activeTabId, tabs.size]);

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
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
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
    </div>
  );
}
