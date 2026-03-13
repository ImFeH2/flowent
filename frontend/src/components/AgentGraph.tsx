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
import { useTheme } from "@/context/ThemeContext";
import {
  AGENT_NODE_HEIGHT,
  getAgentNodeWidth,
  getLayoutedElements,
} from "@/lib/layout";
import { useAgentRuntime, useAgentUI } from "@/context/AgentContext";
import { terminateNode } from "@/lib/api";
import { getNodeLabel } from "@/lib/constants";

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

export function AgentGraph() {
  const { theme } = useTheme();
  const { agents, activeMessages, activeToolCalls } = useAgentRuntime();
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

  const { nodes, edges, structureKey } = useMemo(() => {
    const rawNodes: Node[] = [];
    const edgeSet = new Set<string>();
    const rawEdges: Edge[] = [];
    const nodeIds: string[] = [];

    for (const [id, agent] of agents) {
      nodeIds.push(id);
      const label = getNodeLabel({
        name: agent.name,
        roleName: agent.role_name,
        nodeType: agent.node_type,
      });
      const width = getAgentNodeWidth(label);
      rawNodes.push({
        id,
        type: "agent",
        position: { x: 0, y: 0 },
        width,
        height: AGENT_NODE_HEIGHT,
        data: {
          label,
          width,
          node_type: agent.node_type,
          state: agent.state,
          shortId: id.slice(0, 8),
          name: agent.name,
          role_name: agent.role_name,
          latestTodo: agent.todos[agent.todos.length - 1]?.text ?? null,
          selected: id === selectedAgentId,
          toolCall: activeToolCalls.get(id) ?? null,
        },
      });

      for (const connId of agent.connections) {
        const edgeId = [id, connId].sort().join("-");
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const activeMessage = activeEdgeMessages.get(edgeId);
          rawEdges.push({
            id: edgeId,
            source: id,
            target: connId,
            type: "animated",
            data: {
              active: !!activeMessage,
              flowDirection: activeMessage
                ? activeMessage.fromId === id && activeMessage.toId === connId
                  ? "forward"
                  : "reverse"
                : null,
            },
            animated: false,
          });
        }
      }
    }

    const structureKey = `${nodeIds.sort().join("|")}::${Array.from(edgeSet)
      .sort()
      .join("|")}`;

    if (rawNodes.length === 0) {
      return { nodes: [], edges: [], structureKey };
    }

    const { nodes, edges } = getLayoutedElements(rawNodes, rawEdges);
    return { nodes, edges, structureKey };
  }, [agents, selectedAgentId, activeToolCalls, activeEdgeMessages]);

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
            colorMode={theme}
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
