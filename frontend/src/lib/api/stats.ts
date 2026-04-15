import { requestJson } from "./shared";
import type { StatsPayload, StatsRange } from "@/types";

export async function fetchStats(range: StatsRange): Promise<StatsPayload> {
  return requestJson<StatsPayload, StatsPayload>(
    `/api/stats?range=${encodeURIComponent(range)}`,
    {
      method: "GET",
      errorMessage: "Failed to fetch stats",
    },
  );
}
