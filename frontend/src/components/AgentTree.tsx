import {
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect,
  type MouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  useReactFlow,
  useViewport,
  BaseEdge,
  getStraightPath,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { AgentGraphNode } from "@/components/AgentGraphNode";
import { AgentWindow } from "@/components/AgentWindow";
import { ContextMenu, type ContextMenuEntry } from "@/components/ContextMenu";
import { getLayoutedElements } from "@/lib/layout";
import {
  useAgent,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} from "@/context/AgentContext";
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
          stroke: hasActiveMessage ? "#60a5fa" : "#52525b",
          strokeWidth: 1.5,
        }}
      />
      {hasActiveMessage && (
        <circle r="4" fill="#60a5fa" filter="url(#glow)">
          <animateMotion dur="0.8s" repeatCount="indefinite" path={edgePath} />
        </circle>
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

export function AgentTree() {
  const {
    agents,
    selectedAgentId,
    selectAgent,
    openAgentWindow,
    closeAllWindows,
    activeMessages,
    activeToolCalls,
  } = useAgent();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const screenToFlowRef = useRef<((pos: XYPosition) => XYPosition) | null>(
    null,
  );

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
              stroke: isActive ? "#60a5fa" : "#52525b",
              strokeWidth: 1.5,
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
    (event, node) => {
      const mouseEvent = event as unknown as MouseEvent;
      selectAgent(node.id);

      const convert = screenToFlowRef.current;
      if (convert) {
        const flowPos = convert({
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        });
        openAgentWindow(node.id, flowPos.x, flowPos.y);
      }
    },
    [selectAgent, openAgentWindow],
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
    const items: ContextMenuEntry[] = [
      { label: "Close All Windows", onClick: closeAllWindows },
    ];
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
  }, [contextMenu, closeAllWindows, agents]);

  const tooltipAgent = tooltip ? agents.get(tooltip.agentId) : null;

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 relative overflow-hidden">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-3">
              <Network className="size-8 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-500">Loading agent graph...</p>
            </div>
          </div>
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
            maxZoom={1.5}
            className="bg-zinc-950"
          >
            <Background color="#27272a" gap={20} size={1} />
            <svg>
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
            </svg>
            <FlowWindowLayer screenToFlowRef={screenToFlowRef} />
          </ReactFlow>
        )}
      </div>

      {tooltip && tooltipAgent && (
        <div
          className="pointer-events-none fixed z-[100] rounded border border-zinc-700 bg-zinc-800 px-3 py-2 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-200">
              {tooltipAgent.name ?? (
                <span className="capitalize">{tooltipAgent.node_type}</span>
              )}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] ${stateBadgeColor[tooltipAgent.state]}`}
            >
              {tooltipAgent.state}
            </Badge>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            {tooltip.agentId.slice(0, 8)}
          </div>
        </div>
      )}

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

interface FlowWindowLayerProps {
  screenToFlowRef: React.MutableRefObject<
    ((pos: XYPosition) => XYPosition) | null
  >;
}

function FlowWindowLayer({ screenToFlowRef }: FlowWindowLayerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();
  const { openWindows } = useAgent();

  useEffect(() => {
    screenToFlowRef.current = (pos) => {
      const fp = screenToFlowPosition(pos);
      return { x: fp.x - DEFAULT_WIDTH / 2, y: fp.y - DEFAULT_HEIGHT / 2 };
    };
  }, [screenToFlowPosition, screenToFlowRef]);

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 origin-top-left z-50"
      style={{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      }}
    >
      {Array.from(openWindows.entries()).map(([id, ws]) => (
        <AgentWindow
          key={id}
          agentId={id}
          windowState={ws}
          zoom={viewport.zoom}
        />
      ))}
    </div>
  );
}
