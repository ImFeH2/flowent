import type { Edge, Node } from "@xyflow/react";

export const AGENT_NODE_MIN_WIDTH = 100;
export const AGENT_NODE_MAX_WIDTH = 300;
export const AGENT_NODE_HEIGHT = 56;
const LAYOUT_COMPONENT_GAP_X = 120;
const LAYOUT_COMPONENT_GAP_Y = 140;
const LAYOUT_GRID_GAP_X = 40;
const LAYOUT_GRID_GAP_Y = 40;
const FORCE_LAYOUT_ITERATIONS = 220;
const FORCE_LAYOUT_REPULSION = 42000;
const FORCE_LAYOUT_SPRING = 0.08;
const FORCE_LAYOUT_DAMPING = 0.82;
const FORCE_LAYOUT_CENTER_PULL = 0.012;
const FORCE_LAYOUT_MIN_DISTANCE = 60;
const FORCE_LAYOUT_MAX_STEP = 18;
const FORCE_LAYOUT_IDEAL_LENGTH = 180;

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
  const orderedNodes = [...nodes].sort((left, right) =>
    getNodeSortKey(left).localeCompare(getNodeSortKey(right)),
  );
  if (orderedNodes.length <= 1) {
    return orderedNodes.map((node) => ({
      ...node,
      position: { x: 0, y: 0 },
    }));
  }

  const nodeIndexById = new Map(
    orderedNodes.map((node, index) => [node.id, index] as const),
  );
  const neighbors = new Map<string, Set<string>>();
  for (const node of orderedNodes) {
    neighbors.set(node.id, new Set());
  }
  const edgePairs: Array<[string, string]> = [];
  const seenEdgePairs = new Set<string>();
  for (const edge of [...edges].sort((left, right) =>
    `${left.source}<->${left.target}`.localeCompare(
      `${right.source}<->${right.target}`,
    ),
  )) {
    if (!nodeIndexById.has(edge.source) || !nodeIndexById.has(edge.target)) {
      continue;
    }
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
    const edgeKey =
      edge.source <= edge.target
        ? `${edge.source}<->${edge.target}`
        : `${edge.target}<->${edge.source}`;
    if (seenEdgePairs.has(edgeKey)) {
      continue;
    }
    seenEdgePairs.add(edgeKey);
    edgePairs.push(
      edge.source <= edge.target
        ? [edge.source, edge.target]
        : [edge.target, edge.source],
    );
  }

  const centerNode = [...orderedNodes].sort((left, right) => {
    const degreeDiff =
      (neighbors.get(right.id)?.size ?? 0) -
      (neighbors.get(left.id)?.size ?? 0);
    if (degreeDiff !== 0) {
      return degreeDiff;
    }
    return getNodeSortKey(left).localeCompare(getNodeSortKey(right));
  })[0];

  const shellDistance = new Map<string, number>();
  const pendingNodeIds = [centerNode.id];
  shellDistance.set(centerNode.id, 0);
  while (pendingNodeIds.length > 0) {
    const currentNodeId = pendingNodeIds.shift();
    if (!currentNodeId) {
      continue;
    }
    const currentDistance = shellDistance.get(currentNodeId) ?? 0;
    for (const neighborId of neighbors.get(currentNodeId) ?? []) {
      if (shellDistance.has(neighborId)) {
        continue;
      }
      shellDistance.set(neighborId, currentDistance + 1);
      pendingNodeIds.push(neighborId);
    }
  }

  for (const node of orderedNodes) {
    if (!shellDistance.has(node.id)) {
      shellDistance.set(node.id, 0);
    }
  }

  const shellBuckets = new Map<number, Node[]>();
  for (const node of orderedNodes) {
    const distance = shellDistance.get(node.id) ?? 0;
    const bucket = shellBuckets.get(distance) ?? [];
    bucket.push(node);
    shellBuckets.set(distance, bucket);
  }

  const positions = orderedNodes.map(() => ({ x: 0, y: 0 }));
  const velocities = orderedNodes.map(() => ({ x: 0, y: 0 }));

  for (const [distance, bucket] of [...shellBuckets.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    if (distance === 0) {
      for (const node of bucket) {
        const nodeIndex = nodeIndexById.get(node.id);
        if (nodeIndex !== undefined) {
          positions[nodeIndex] = { x: 0, y: 0 };
        }
      }
      continue;
    }
    const orderedBucket = [...bucket].sort((left, right) =>
      getNodeSortKey(left).localeCompare(getNodeSortKey(right)),
    );
    const angleStep = (Math.PI * 2) / orderedBucket.length;
    const radius = FORCE_LAYOUT_IDEAL_LENGTH * Math.max(distance, 0.9);
    orderedBucket.forEach((node, index) => {
      const nodeIndex = nodeIndexById.get(node.id);
      if (nodeIndex === undefined) {
        return;
      }
      const angle = angleStep * index + distance * 0.37;
      positions[nodeIndex] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
  }

  for (let iteration = 0; iteration < FORCE_LAYOUT_ITERATIONS; iteration += 1) {
    const forces = orderedNodes.map(() => ({ x: 0, y: 0 }));

    for (let leftIndex = 0; leftIndex < orderedNodes.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < orderedNodes.length;
        rightIndex += 1
      ) {
        const deltaX = positions[rightIndex].x - positions[leftIndex].x;
        const deltaY = positions[rightIndex].y - positions[leftIndex].y;
        const distance = Math.max(
          FORCE_LAYOUT_MIN_DISTANCE,
          Math.hypot(deltaX, deltaY),
        );
        const scale = FORCE_LAYOUT_REPULSION / (distance * distance);
        const forceX = (deltaX / distance) * scale;
        const forceY = (deltaY / distance) * scale;
        forces[leftIndex].x -= forceX;
        forces[leftIndex].y -= forceY;
        forces[rightIndex].x += forceX;
        forces[rightIndex].y += forceY;
      }
    }

    for (const [fromNodeId, toNodeId] of edgePairs) {
      const fromIndex = nodeIndexById.get(fromNodeId);
      const toIndex = nodeIndexById.get(toNodeId);
      if (fromIndex === undefined || toIndex === undefined) {
        continue;
      }
      const deltaX = positions[toIndex].x - positions[fromIndex].x;
      const deltaY = positions[toIndex].y - positions[fromIndex].y;
      const distance = Math.max(
        FORCE_LAYOUT_MIN_DISTANCE,
        Math.hypot(deltaX, deltaY),
      );
      const idealLength =
        FORCE_LAYOUT_IDEAL_LENGTH +
        ((neighbors.get(fromNodeId)?.size ?? 0) +
          (neighbors.get(toNodeId)?.size ?? 0)) *
          6;
      const scale = (distance - idealLength) * FORCE_LAYOUT_SPRING;
      const forceX = (deltaX / distance) * scale;
      const forceY = (deltaY / distance) * scale;
      forces[fromIndex].x += forceX;
      forces[fromIndex].y += forceY;
      forces[toIndex].x -= forceX;
      forces[toIndex].y -= forceY;
    }

    for (let index = 0; index < orderedNodes.length; index += 1) {
      forces[index].x -= positions[index].x * FORCE_LAYOUT_CENTER_PULL;
      forces[index].y -= positions[index].y * FORCE_LAYOUT_CENTER_PULL;

      velocities[index].x =
        (velocities[index].x + forces[index].x) * FORCE_LAYOUT_DAMPING;
      velocities[index].y =
        (velocities[index].y + forces[index].y) * FORCE_LAYOUT_DAMPING;

      const clampedStepX = Math.max(
        -FORCE_LAYOUT_MAX_STEP,
        Math.min(FORCE_LAYOUT_MAX_STEP, velocities[index].x),
      );
      const clampedStepY = Math.max(
        -FORCE_LAYOUT_MAX_STEP,
        Math.min(FORCE_LAYOUT_MAX_STEP, velocities[index].y),
      );
      positions[index].x += clampedStepX;
      positions[index].y += clampedStepY;
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  const layoutedNodes = orderedNodes.map((node, index) => {
    const position = {
      x: positions[index].x - getNodeWidth(node) / 2,
      y: positions[index].y - getNodeHeight(node) / 2,
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
