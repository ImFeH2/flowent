import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import { getAgentNodeWidth, getLayoutedElements } from "@/lib/layout";
import type {
  AgentBlueprint,
  BlueprintEdge,
  BlueprintSlot,
  BlueprintVersionSummary,
} from "@/types";

export const BLUEPRINT_FIT_VIEW_OPTIONS = {
  duration: 180,
  padding: 0.2,
  maxZoom: 1.05,
} as const;

export type DraftMode = "create" | "edit";

export interface BlueprintDraft {
  sourceId: string | null;
  mode: DraftMode;
  name: string;
  description: string;
  slots: BlueprintSlot[];
  edges: BlueprintEdge[];
  baseVersion: number | null;
  versionHistory: BlueprintVersionSummary[];
}

export interface BlueprintViewModel {
  name: string;
  description: string;
  version: number | null;
  slots: BlueprintSlot[];
  edges: BlueprintEdge[];
  updated_at: number | null;
  version_history: BlueprintVersionSummary[];
  isDraft: boolean;
}

export function getCanonicalEdgeId(leftId: string, rightId: string) {
  return leftId <= rightId
    ? `${leftId}<->${rightId}`
    : `${rightId}<->${leftId}`;
}

function getHorizontalHandleIds(
  sourcePosition: { x: number; y: number } | undefined,
  targetPosition: { x: number; y: number } | undefined,
) {
  if ((sourcePosition?.x ?? 0) <= (targetPosition?.x ?? 0)) {
    return {
      sourceHandle: "right-source",
      targetHandle: "left-target",
    };
  }
  return {
    sourceHandle: "left-source",
    targetHandle: "right-target",
  };
}

export function createBlueprintCreateDraft(): BlueprintDraft {
  return {
    sourceId: null,
    mode: "create",
    name: "",
    description: "",
    slots: [],
    edges: [],
    baseVersion: null,
    versionHistory: [],
  };
}

export function createBlueprintEditDraft(
  blueprint: AgentBlueprint,
): BlueprintDraft {
  return {
    sourceId: blueprint.id,
    mode: "edit",
    name: blueprint.name,
    description: blueprint.description,
    slots: blueprint.slots.map((slot) => ({
      id: slot.id,
      role_name: slot.role_name,
      display_name: slot.display_name,
    })),
    edges: blueprint.edges.map((edge) => ({
      from_slot_id: edge.from_slot_id,
      to_slot_id: edge.to_slot_id,
    })),
    baseVersion: blueprint.version,
    versionHistory: resolveVersionHistory(blueprint),
  };
}

export function createBlueprintSlotDraft(roleName = "Worker"): BlueprintSlot {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role_name: roleName,
    display_name: null,
  };
}

export function createBlueprintEdgeDraft(
  slots: BlueprintSlot[],
  sourceSlotId?: string | null,
): BlueprintEdge {
  const validTargets = slots.map((slot) => slot.id);
  const nextSource =
    sourceSlotId && validTargets.includes(sourceSlotId)
      ? sourceSlotId
      : (validTargets[0] ?? "");
  const nextTarget =
    validTargets.find((candidate) => candidate !== nextSource) ?? "";

  return {
    from_slot_id: nextSource,
    to_slot_id: nextTarget,
  };
}

export function resolveVersionHistory(
  blueprint: Pick<AgentBlueprint, "version" | "updated_at" | "version_history">,
): BlueprintVersionSummary[] {
  if (blueprint.version_history && blueprint.version_history.length > 0) {
    return blueprint.version_history;
  }
  return [
    {
      version: blueprint.version,
      updated_at: blueprint.updated_at,
    },
  ];
}

export function buildDisplayBlueprint(
  draft: BlueprintDraft | null,
  selectedBlueprint: AgentBlueprint | null,
): BlueprintViewModel | null {
  if (draft) {
    return {
      name: draft.name,
      description: draft.description,
      version: draft.mode === "edit" ? draft.baseVersion : null,
      slots: draft.slots,
      edges: draft.edges,
      updated_at:
        draft.mode === "edit"
          ? (draft.versionHistory[draft.versionHistory.length - 1]
              ?.updated_at ?? null)
          : null,
      version_history: draft.versionHistory,
      isDraft: true,
    };
  }
  if (!selectedBlueprint) {
    return null;
  }
  return {
    name: selectedBlueprint.name,
    description: selectedBlueprint.description,
    version: selectedBlueprint.version,
    slots: selectedBlueprint.slots,
    edges: selectedBlueprint.edges,
    updated_at: selectedBlueprint.updated_at,
    version_history: resolveVersionHistory(selectedBlueprint),
    isDraft: false,
  };
}

export function buildFlowGraph(
  blueprint: BlueprintViewModel | null,
  selectedSlotId: string | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!blueprint) {
    return { nodes: [], edges: [] };
  }

  const baseNodes: FlowNode[] = blueprint.slots.map((slot) => {
    const label = slot.display_name || slot.role_name;
    return {
      id: slot.id,
      type: "blueprint",
      position: { x: 0, y: 0 },
      width: getAgentNodeWidth(label),
      data: {
        label,
        roleName: slot.role_name,
        selected: selectedSlotId === slot.id,
      },
      selectable: true,
      draggable: false,
    } satisfies FlowNode;
  });

  const nodeIds = new Set(baseNodes.map((node) => node.id));
  const seenEdgeIds = new Set<string>();
  const baseEdges: FlowEdge[] = [];
  for (const edge of blueprint.edges) {
    if (!nodeIds.has(edge.from_slot_id) || !nodeIds.has(edge.to_slot_id)) {
      continue;
    }
    const edgeId = getCanonicalEdgeId(edge.from_slot_id, edge.to_slot_id);
    if (seenEdgeIds.has(edgeId)) {
      continue;
    }
    seenEdgeIds.add(edgeId);
    const [source, target] =
      edge.from_slot_id <= edge.to_slot_id
        ? [edge.from_slot_id, edge.to_slot_id]
        : [edge.to_slot_id, edge.from_slot_id];
    baseEdges.push({
      id: edgeId,
      source,
      target,
      type: "smoothstep",
      animated: false,
      style: {
        stroke: "var(--graph-edge)",
        strokeWidth: 1.5,
      },
      selectable: false,
    });
  }

  const layouted = getLayoutedElements(baseNodes, baseEdges);
  const nodePositions = new Map(
    layouted.nodes.map((node) => [node.id, node.position] as const),
  );

  return {
    nodes: layouted.nodes,
    edges: layouted.edges.map((edge) => ({
      ...edge,
      ...getHorizontalHandleIds(
        nodePositions.get(edge.source),
        nodePositions.get(edge.target),
      ),
    })),
  };
}

export function buildVisibleVersionHistory(
  blueprint: BlueprintViewModel | null,
): BlueprintVersionSummary[] {
  return blueprint?.version_history.length
    ? blueprint.version_history
    : blueprint?.version != null && blueprint.updated_at != null
      ? [
          {
            version: blueprint.version,
            updated_at: blueprint.updated_at,
          },
        ]
      : [];
}

export function validateBlueprintDraft(draft: BlueprintDraft): string | null {
  const name = draft.name.trim();
  if (!name) {
    return "Blueprint name is required";
  }
  if (draft.slots.length === 0) {
    return "Blueprint needs at least one slot";
  }

  const validNodeIds = new Set(draft.slots.map((slot) => slot.id));
  const hasInvalidEdge = draft.edges.some(
    (edge) =>
      !validNodeIds.has(edge.from_slot_id) ||
      !validNodeIds.has(edge.to_slot_id) ||
      edge.from_slot_id === edge.to_slot_id,
  );
  if (hasInvalidEdge) {
    return "All blueprint connections must link two different valid slots";
  }

  const seenConnectionIds = new Set<string>();
  for (const edge of draft.edges) {
    const edgeId = getCanonicalEdgeId(edge.from_slot_id, edge.to_slot_id);
    if (seenConnectionIds.has(edgeId)) {
      return "Duplicate blueprint connections are not allowed";
    }
    seenConnectionIds.add(edgeId);
  }

  return null;
}

export function buildBlueprintPayload(draft: BlueprintDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    slots: draft.slots.map((slot) => ({
      id: slot.id,
      role_name: slot.role_name.trim(),
      display_name: slot.display_name?.trim() || null,
    })),
    edges: draft.edges.map((edge) => ({
      from_slot_id: edge.from_slot_id,
      to_slot_id: edge.to_slot_id,
    })),
  };
}
