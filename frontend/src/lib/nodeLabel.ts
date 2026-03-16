import type { Node } from "@/types";

function clampLabel(value: string, maxLength?: number): string {
  if (!maxLength || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function getNodeLabel(
  nodeId: string,
  nodes?: Map<string, Node>,
  maxLength?: number,
): string {
  if (!nodeId) {
    return "unknown";
  }
  if (nodeId === "human") {
    return "Human";
  }
  if (nodeId === "assistant") {
    return "Assistant";
  }

  const node = nodes?.get(nodeId);
  const name = node?.name?.trim();
  if (name) {
    return clampLabel(name, maxLength);
  }

  const roleName = node?.role_name?.trim();
  if (roleName) {
    return clampLabel(roleName, maxLength);
  }

  return clampLabel(nodeId.slice(0, 8), maxLength);
}
