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
  MiniMap,
  BaseEdge,
  getStraightPath,
  type Node,
  type Edge,
  type EdgeProps,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "motion/react";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { AgentGraphNode } from "@/components/AgentGraphNode";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import { useTheme } from "@/context/ThemeContext";
import { getLayoutedElements } from "@/lib/layout";
import { useAgent } from "@/context/AgentContext";
import { Badge } from "@/components/ui/badge";
import { stateBadgeColor } from "@/lib/constants";
import { terminateNode } from "@/lib/api";

const nodeTypes: NodeTypes = {
  agent: AgentGraphNode,
};

function AnimatedMessageEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, id, data } = props;
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const hasActiveMessage = !!(data as Record<string, unknown> | undefined)
    ?.active;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: hasActiveMessage
            ? "var(--graph-edge-active)"
            : "var(--graph-edge)",
          strokeWidth: hasActiveMessage ? 2.2 : 1.2,
        }}
      />
      {hasActiveMessage && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke="url(#agent-edge-flow)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="8 6"
            opacity="0.8"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="14"
              to="0"
              dur="0.6s"
              repeatCount="indefinite"
            />
          </path>
          <circle r="2.6" fill="var(--graph-edge-active)">
            <animateMotion
              dur="0.5s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
          <circle r="2" fill="var(--graph-edge-active)" opacity="0.6">
            <animateMotion
              dur="0.5s"
              repeatCount="indefinite"
              path={edgePath}
              begin="0.25s"
            />
          </circle>
        </>
      )}
    </>
  );
}

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
  const {
    agents,
    selectedAgentId,
    selectAgent,
    activeMessages,
    activeToolCalls,
  } = useAgent();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(
    null,
  );
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipSize, setTooltipSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const activeEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (const msg of activeMessages) {
      set.add(`${msg.fromId}-${msg.toId}`);
      set.add(`${msg.toId}-${msg.fromId}`);
    }
    return set;
  }, [activeMessages]);

  const { nodes, edges } = useMemo(() => {
    const rawNodes: Node[] = [];
    const edgeSet = new Set<string>();
    const rawEdges: Edge[] = [];

    for (const [id, agent] of agents) {
      rawNodes.push({
        id,
        type: "agent",
        position: { x: 0, y: 0 },
        data: {
          node_type: agent.node_type,
          state: agent.state,
          shortId: id.slice(0, 8),
          name: agent.name,
          selected: id === selectedAgentId,
          toolCall: activeToolCalls.get(id) ?? null,
        },
      });

      for (const connId of agent.connections) {
        const edgeId = [id, connId].sort().join("-");
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          const isActive =
            activeEdgeSet.has(`${id}-${connId}`) ||
            activeEdgeSet.has(`${connId}-${id}`);
          rawEdges.push({
            id: edgeId,
            source: id,
            target: connId,
            type: "animated",
            data: { active: isActive },
            animated: false,
          });
        }
      }
    }

    if (rawNodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    return getLayoutedElements(rawNodes, rawEdges);
  }, [agents, selectedAgentId, activeToolCalls, activeEdgeSet]);

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
      const isProtected =
        node?.node_type === "steward" || node?.node_type === "conductor";
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
  }, [
    tooltip?.agentId,
    tooltipAgent?.state,
    tooltipAgent?.name,
    tooltipAgent?.node_type,
  ]);

  const tooltipStyle = useMemo(() => {
    if (!tooltip || typeof window === "undefined") return undefined;
    const margin = 8;
    const offset = 12;
    const width = tooltipSize?.width ?? 240;
    const height = tooltipSize?.height ?? 64;
    const maxLeft = window.innerWidth - margin - width;
    const maxTop = window.innerHeight - margin - height;
    const left = Math.max(margin, Math.min(tooltip.x + offset, maxLeft));
    const top = Math.max(margin, Math.min(tooltip.y + offset, maxTop));
    return { left, top };
  }, [tooltip, tooltipSize]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        {nodes.length === 0 ? (
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
            fitView
            fitViewOptions={{ padding: 0.3 }}
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
            <MiniMap
              zoomable
              pannable
              className="!rounded-md !border !border-glass-border !bg-graph-bg !shadow-lg"
              maskColor="var(--surface-overlay)"
              nodeColor="var(--graph-edge-active)"
            />
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
              </defs>
            </svg>
          </ReactFlow>
        )}
      </div>

      <AnimatePresence>
        {tooltip && tooltipAgent ? (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed z-[100] rounded-md border border-glass-border bg-glass-bg px-3 py-2 shadow-xl backdrop-blur-sm"
            style={tooltipStyle}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {tooltipAgent.name ?? (
                  <span className="capitalize">{tooltipAgent.node_type}</span>
                )}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] ${stateBadgeColor[tooltipAgent.state]}`}
              >
                {tooltipAgent.state.toUpperCase()}
              </Badge>
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              {tooltip.agentId.slice(0, 8)}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
