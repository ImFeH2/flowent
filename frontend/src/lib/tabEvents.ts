import type { AgentEvent, NetworkSource, Node, TaskTab } from "@/types";

const NETWORK_SOURCE_STATES = new Set<NetworkSource["state"]>([
  "manual",
  "blueprint-derived",
  "drifted",
]);

const HAS_OWN = Object.prototype.hasOwnProperty;

export const MANUAL_NETWORK_SOURCE: NetworkSource = {
  state: "manual",
  blueprint_id: null,
  blueprint_name: null,
  blueprint_version: null,
  blueprint_available: false,
};

function hasOwn(data: Record<string, unknown>, key: string): boolean {
  return HAS_OWN.call(data, key);
}

function readNumberField(
  data: Record<string, unknown>,
  key: string,
): number | undefined {
  return typeof data[key] === "number" ? data[key] : undefined;
}

function readTabLeaderId(
  data: Record<string, unknown>,
): TaskTab["leader_id"] | undefined {
  if (!hasOwn(data, "leader_id")) {
    return undefined;
  }
  return typeof data.leader_id === "string" || data.leader_id === null
    ? (data.leader_id as TaskTab["leader_id"])
    : undefined;
}

function readOptionalCount(
  data: Record<string, unknown>,
  key: "node_count" | "edge_count",
): number | undefined {
  if (!hasOwn(data, key)) {
    return undefined;
  }
  return readNumberField(data, key);
}

function isNetworkSource(value: unknown): value is NetworkSource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const source = value as Record<string, unknown>;
  return (
    NETWORK_SOURCE_STATES.has(source.state as NetworkSource["state"]) &&
    (typeof source.blueprint_id === "string" || source.blueprint_id === null) &&
    (typeof source.blueprint_name === "string" ||
      source.blueprint_name === null) &&
    (typeof source.blueprint_version === "number" ||
      source.blueprint_version === null) &&
    typeof source.blueprint_available === "boolean"
  );
}

export function getTabEventId(data: AgentEvent["data"]): string | null {
  return typeof data.id === "string" ? data.id : null;
}

export function createTaskTabFromEvent(
  data: AgentEvent["data"],
  now = Date.now(),
): TaskTab | null {
  const id = getTabEventId(data);
  if (id === null || typeof data.title !== "string") {
    return null;
  }

  return {
    id,
    title: data.title,
    goal: typeof data.goal === "string" ? data.goal : "",
    leader_id: readTabLeaderId(data) ?? null,
    created_at: readNumberField(data, "created_at") ?? now,
    updated_at: readNumberField(data, "updated_at") ?? now,
    network_source: isNetworkSource(data.network_source)
      ? data.network_source
      : MANUAL_NETWORK_SOURCE,
    node_count: readOptionalCount(data, "node_count"),
    edge_count: readOptionalCount(data, "edge_count"),
  };
}

export function mergeTaskTabUpdate(
  current: TaskTab | undefined,
  data: AgentEvent["data"],
  now = Date.now(),
): TaskTab | null {
  if (!current) {
    return createTaskTabFromEvent(data, now);
  }

  const nextLeaderId = readTabLeaderId(data);

  return {
    ...current,
    title: typeof data.title === "string" ? data.title : current.title,
    goal: typeof data.goal === "string" ? data.goal : current.goal,
    leader_id:
      hasOwn(data, "leader_id") && nextLeaderId !== undefined
        ? nextLeaderId
        : current.leader_id,
    created_at: readNumberField(data, "created_at") ?? current.created_at,
    updated_at: readNumberField(data, "updated_at") ?? current.updated_at,
    network_source:
      hasOwn(data, "network_source") && isNetworkSource(data.network_source)
        ? data.network_source
        : current.network_source,
    node_count: hasOwn(data, "node_count")
      ? readOptionalCount(data, "node_count")
      : current.node_count,
    edge_count: hasOwn(data, "edge_count")
      ? readOptionalCount(data, "edge_count")
      : current.edge_count,
  };
}

export function getDeletedTabNodeIds(
  data: AgentEvent["data"],
  nodes: ReadonlyMap<string, Pick<Node, "tab_id">>,
): Set<string> {
  const removedNodeIds = Array.isArray(data.removed_node_ids)
    ? data.removed_node_ids.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const removedNodeIdSet = new Set(removedNodeIds);
  const deletedTabId = getTabEventId(data);
  if (deletedTabId === null) {
    return removedNodeIdSet;
  }

  for (const [nodeId, node] of nodes.entries()) {
    if (node.tab_id === deletedTabId) {
      removedNodeIdSet.add(nodeId);
    }
  }

  return removedNodeIdSet;
}
