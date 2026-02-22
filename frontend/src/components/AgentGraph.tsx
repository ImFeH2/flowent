import { useMemo, useCallback, useState, type MouseEvent } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  BaseEdge,
  getStraightPath,
  type Node,
  type Edge,
  type EdgeProps,
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
            ? "rgba(214,220,229,0.52)"
            : "rgba(148,163,184,0.18)",
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
          <circle r="2.6" fill="#d4dae4">
            <animateMotion
              dur="0.5s"
              repeatCount="indefinite"
              path={edgePath}
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
  const {
    agents,
    selectedAgentId,
    selectAgent,
    activeMessages,
    activeToolCalls,
  } = useAgent();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
            style: {
              stroke: isActive
                ? "rgba(214,220,229,0.52)"
                : "rgba(148,163,184,0.18)",
              strokeWidth: isActive ? 2.2 : 1.2,
            },
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
      items.push("divider");
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
    }
    return items;
  }, [contextMenu, agents]);

  const tooltipAgent = tooltip ? agents.get(tooltip.agentId) : null;

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        {nodes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            transition={{
              repeat: Infinity,
              repeatType: "mirror",
              duration: 1.2,
            }}
            className="flex h-full items-center justify-center"
          >
            <div className="space-y-3 text-center">
              <Network className="mx-auto size-8 text-primary/65" />
              <p className="text-sm text-muted-foreground">
                Loading agent graph...
              </p>
            </div>
          </motion.div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
            className="bg-transparent"
          >
            <Background color="rgba(125,125,135,0.12)" gap={30} size={1} />
            <MiniMap
              zoomable
              pannable
              className="!rounded-md !border !border-white/10 !bg-[#101114] !shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
              maskColor="rgba(8,8,10,0.72)"
              nodeColor="rgba(196,202,212,0.75)"
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
                  <stop offset="0%" stopColor="#8f96a3" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#d4dae4" stopOpacity="0.94" />
                  <stop offset="100%" stopColor="#8f96a3" stopOpacity="0.2" />
                </linearGradient>
              </defs>
            </svg>
          </ReactFlow>
        )}
      </div>

      <AnimatePresence>
        {tooltip && tooltipAgent ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed z-[100] rounded-md border border-white/10 bg-[#121316]/95 px-3 py-2 shadow-xl backdrop-blur-sm"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
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
