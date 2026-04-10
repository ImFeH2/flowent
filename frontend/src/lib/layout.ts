import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export const AGENT_NODE_MIN_WIDTH = 100;
export const AGENT_NODE_MAX_WIDTH = 300;
export const AGENT_NODE_HEIGHT = 56;
const LAYOUT_COMPONENT_GAP_X = 120;
const LAYOUT_COMPONENT_GAP_Y = 140;
const LAYOUT_GRID_GAP_X = 40;
const LAYOUT_GRID_GAP_Y = 40;

const NARROW_CHARS = /^[il1.,!|:;]$/;
const SEMI_NARROW_CHARS = /^[fjrt\-[\]()]$/;
const WIDE_CHARS = /^[wmMWOQ@]$/;
const UPPERCASE_CHARS = /^[A-Z]$/;

export function getAgentNodeWidth(label: string): number {
  const textWidth = Array.from(label).reduce((total, char) => {
    if (char === " ") {
      return total + 4;
    }
    const code = char.charCodeAt(0);
    if (code > 255) {
      return total + 13;
    }
    if (NARROW_CHARS.test(char)) return total + 4;
    if (SEMI_NARROW_CHARS.test(char)) return total + 5.5;
    if (WIDE_CHARS.test(char)) return total + 10.5;
    if (UPPERCASE_CHARS.test(char)) return total + 8.5;
    return total + 7;
  }, 0);

  return Math.max(
    AGENT_NODE_MIN_WIDTH,
    Math.min(AGENT_NODE_MAX_WIDTH, textWidth + 76),
  );
}

function getNodeWidth(node: Node): number {
  return typeof node.width === "number" ? node.width : AGENT_NODE_MIN_WIDTH;
}

function getNodeHeight(node: Node): number {
  return typeof node.height === "number" ? node.height : AGENT_NODE_HEIGHT;
}

function getNodeSortKey(node: Node): string {
  const label =
    typeof (node.data as { label?: unknown } | undefined)?.label === "string"
      ? (node.data as { label: string }).label
      : node.id;
  return `${label}\u0000${node.id}`;
}

function getComponentBounds(nodes: Node[]) {
  let maxRight = 0;
  let maxBottom = 0;

  for (const node of nodes) {
    maxRight = Math.max(maxRight, node.position.x + getNodeWidth(node));
    maxBottom = Math.max(maxBottom, node.position.y + getNodeHeight(node));
  }

  return {
    width: maxRight,
    height: maxBottom,
  };
}

function layoutComponent(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  const orderedNodes = [...nodes].sort((left, right) =>
    getNodeSortKey(left).localeCompare(getNodeSortKey(right)),
  );
  for (const node of orderedNodes) {
    g.setNode(node.id, {
      width: getNodeWidth(node),
      height: getNodeHeight(node),
    });
  }
  for (const edge of [...edges].sort((left, right) =>
    `${left.source}->${left.target}`.localeCompare(
      `${right.source}->${right.target}`,
    ),
  )) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  const layoutedNodes = orderedNodes.map((node) => {
    const pos = g.node(node.id);
    const width = getNodeWidth(node);
    const height = getNodeHeight(node);
    const position = {
      x: pos.x - width / 2,
      y: pos.y - height / 2,
    };
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    return {
      ...node,
      position,
    };
  });

  return layoutedNodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x - minX,
      y: node.position.y - minY,
    },
  }));
}

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const neighbors = new Map<string, Set<string>>();

  for (const node of nodes) {
    neighbors.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const orderedNodes = [...nodes].sort((left, right) =>
    getNodeSortKey(left).localeCompare(getNodeSortKey(right)),
  );
  const visited = new Set<string>();
  const connectedComponents: Array<{
    nodes: Node[];
    bounds: { width: number; height: number };
  }> = [];
  const isolatedNodes: Node[] = [];

  for (const startNode of orderedNodes) {
    if (visited.has(startNode.id)) {
      continue;
    }

    const stack = [startNode.id];
    const componentIds: string[] = [];
    visited.add(startNode.id);

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId) {
        continue;
      }
      componentIds.push(currentId);
      for (const nextId of neighbors.get(currentId) ?? []) {
        if (visited.has(nextId)) {
          continue;
        }
        visited.add(nextId);
        stack.push(nextId);
      }
    }

    const componentNodes = componentIds
      .map((id) => nodeById.get(id))
      .filter((node): node is Node => Boolean(node))
      .sort((left, right) =>
        getNodeSortKey(left).localeCompare(getNodeSortKey(right)),
      );
    const componentNodeIds = new Set(componentNodes.map((node) => node.id));
    const componentEdges = edges.filter(
      (edge) =>
        componentNodeIds.has(edge.source) && componentNodeIds.has(edge.target),
    );

    if (componentNodes.length === 1 && componentEdges.length === 0) {
      isolatedNodes.push(componentNodes[0]);
      continue;
    }

    const layoutedNodes = layoutComponent(componentNodes, componentEdges);
    connectedComponents.push({
      nodes: layoutedNodes,
      bounds: getComponentBounds(layoutedNodes),
    });
  }

  const positions = new Map<string, { x: number; y: number }>();
  let connectedRowWidth = 0;
  let connectedRowHeight = 0;

  for (const component of connectedComponents) {
    for (const node of component.nodes) {
      positions.set(node.id, {
        x: node.position.x + connectedRowWidth,
        y: node.position.y,
      });
    }
    connectedRowWidth += component.bounds.width + LAYOUT_COMPONENT_GAP_X;
    connectedRowHeight = Math.max(connectedRowHeight, component.bounds.height);
  }

  if (isolatedNodes.length > 0) {
    const orderedIsolatedNodes = [...isolatedNodes].sort((left, right) =>
      getNodeSortKey(left).localeCompare(getNodeSortKey(right)),
    );
    const columnCount =
      orderedIsolatedNodes.length <= 2
        ? orderedIsolatedNodes.length
        : Math.ceil(Math.sqrt(orderedIsolatedNodes.length));
    const rowCount = Math.ceil(orderedIsolatedNodes.length / columnCount);
    const columnWidths = Array.from({ length: columnCount }, () => 0);
    const rowHeights = Array.from({ length: rowCount }, () => 0);

    orderedIsolatedNodes.forEach((node, index) => {
      const columnIndex = index % columnCount;
      const rowIndex = Math.floor(index / columnCount);
      columnWidths[columnIndex] = Math.max(
        columnWidths[columnIndex],
        getNodeWidth(node),
      );
      rowHeights[rowIndex] = Math.max(
        rowHeights[rowIndex],
        getNodeHeight(node),
      );
    });

    const columnOffsets: number[] = [];
    let offsetX = 0;
    for (const width of columnWidths) {
      columnOffsets.push(offsetX);
      offsetX += width + LAYOUT_GRID_GAP_X;
    }

    const rowOffsets: number[] = [];
    let offsetY =
      connectedComponents.length > 0
        ? connectedRowHeight + LAYOUT_COMPONENT_GAP_Y
        : 0;
    for (const height of rowHeights) {
      rowOffsets.push(offsetY);
      offsetY += height + LAYOUT_GRID_GAP_Y;
    }

    orderedIsolatedNodes.forEach((node, index) => {
      const columnIndex = index % columnCount;
      const rowIndex = Math.floor(index / columnCount);
      positions.set(node.id, {
        x: columnOffsets[columnIndex],
        y: rowOffsets[rowIndex],
      });
    });
  }

  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
    })),
    edges,
  };
}
