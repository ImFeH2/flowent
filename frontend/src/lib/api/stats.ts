import { requestJson } from "./shared";
import type { StatsPayload, StatsRange } from "@/types";

export async function fetchStats(range: StatsRange): Promise<StatsPayload> {
  return requestJson<Record<string, unknown>, StatsPayload>(
    `/api/stats?range=${encodeURIComponent(range)}`,
    {
      method: "GET",
      errorMessage: "Failed to fetch stats",
      map: (data) => ({
        requested_at:
          typeof data?.requested_at === "number" ? data.requested_at : 0,
        range:
          data?.range === "1h" ||
          data?.range === "24h" ||
          data?.range === "7d" ||
          data?.range === "30d"
            ? data.range
            : range,
        tabs: Array.isArray(data?.workflows)
          ? (data.workflows as StatsPayload["tabs"])
          : [],
        nodes: Array.isArray(data?.nodes)
          ? (data.nodes as Array<Record<string, unknown>>).map(
              (node) =>
                ({
                  ...node,
                  tab_id:
                    typeof node.workflow_id === "string"
                      ? node.workflow_id
                      : null,
                  tab_title:
                    typeof node.workflow_title === "string"
                      ? node.workflow_title
                      : null,
                }) as StatsPayload["nodes"][number],
            )
          : [],
        requests: Array.isArray(data?.requests)
          ? (data.requests as Array<Record<string, unknown>>).map(
              (record) =>
                ({
                  ...record,
                  tab_id:
                    typeof record.workflow_id === "string"
                      ? record.workflow_id
                      : null,
                  tab_title:
                    typeof record.workflow_title === "string"
                      ? record.workflow_title
                      : null,
                }) as StatsPayload["requests"][number],
            )
          : [],
        compacts: Array.isArray(data?.compacts)
          ? (data.compacts as Array<Record<string, unknown>>).map(
              (record) =>
                ({
                  ...record,
                  tab_id:
                    typeof record.workflow_id === "string"
                      ? record.workflow_id
                      : null,
                  tab_title:
                    typeof record.workflow_title === "string"
                      ? record.workflow_title
                      : null,
                }) as StatsPayload["compacts"][number],
            )
          : [],
        mcp_activity: Array.isArray(data?.mcp_activity)
          ? (data.mcp_activity as Array<Record<string, unknown>>).map(
              (record) =>
                ({
                  ...record,
                  tab_id:
                    typeof record.workflow_id === "string"
                      ? record.workflow_id
                      : null,
                }) as NonNullable<StatsPayload["mcp_activity"]>[number],
            )
          : [],
      }),
    },
  );
}
