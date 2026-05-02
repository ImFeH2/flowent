import { formatLocalTimestamp } from "@/lib/datetime";
import type {
  StatsFilterOptions,
  StatsFilters,
  StatsMetric,
  StatsSortKey,
  StatsBucket,
} from "@/lib/stats";
import type { StatsPayload, StatsRange } from "@/types";

export const DEFAULT_STATS_RANGE: StatsRange = "24h";

export const DEFAULT_STATS_FILTERS: StatsFilters = {
  providerId: null,
  model: null,
  tabId: null,
  agentId: null,
};

export const DEFAULT_STATS_METRIC: StatsMetric = "requests";
export const DEFAULT_STATS_SORT_KEY: StatsSortKey = "requests";

export const RANGE_OPTIONS: Array<{ value: StatsRange; label: string }> = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export const FILTER_ALL = "__all__";

export const METRIC_OPTIONS: Array<{ value: StatsMetric; label: string }> = [
  { value: "requests", label: "Requests" },
  { value: "tokens", label: "Tokens" },
  { value: "errors", label: "Errors" },
  { value: "latency", label: "Latency" },
  { value: "compacts", label: "Compacts" },
  { value: "cache_read", label: "Cache Read" },
  { value: "cache_write", label: "Cache Write" },
  { value: "cache_hit_rate", label: "Cache Hit Rate" },
];

export const SORT_OPTIONS: Array<{ value: StatsSortKey; label: string }> = [
  { value: "requests", label: "Requests" },
  { value: "tokens", label: "Tokens" },
  { value: "errors", label: "Errors" },
  { value: "latency", label: "Latency" },
  { value: "cache_hit_rate", label: "Cache Hit Rate" },
];

export const statsSelectTriggerClass =
  "h-8 rounded-md bg-background/50 text-foreground";
export const statsFilterLabelClass =
  "text-[10px] font-medium text-muted-foreground/80";

function hasOption(
  options: Array<{ value: string }>,
  value: string | null,
): value is string {
  return Boolean(value && options.some((option) => option.value === value));
}

export function formatTimestamp(timestamp: number | null | undefined): string {
  return formatLocalTimestamp(timestamp, { fallback: "Unknown" });
}

export function formatInteger(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  return value.toLocaleString();
}

export function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

export function formatRate(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return `${(value * 100).toFixed(1)}%`;
}

export function findLastActiveBucketIndex(buckets: StatsBucket[]): number {
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const bucket = buckets[index];
    if (bucket.requestCount > 0 || bucket.compactCount > 0) {
      return index;
    }
  }
  return Math.max(buckets.length - 1, 0);
}

export function emptyStatsPayload(range: StatsRange): StatsPayload {
  return {
    requested_at: Date.now(),
    range,
    tabs: [],
    nodes: [],
    requests: [],
    compacts: [],
  };
}

export function resolveStatsFilters(
  filters: StatsFilters,
  filterOptions: StatsFilterOptions,
): StatsFilters {
  return {
    providerId: hasOption(filterOptions.providers, filters.providerId)
      ? filters.providerId
      : null,
    model: hasOption(filterOptions.models, filters.model)
      ? filters.model
      : null,
    tabId: hasOption(filterOptions.tabs, filters.tabId) ? filters.tabId : null,
    agentId: hasOption(filterOptions.agents, filters.agentId)
      ? filters.agentId
      : null,
  };
}

export function hasVisibleStatsData(
  input: Pick<StatsPayload, "requests" | "compacts" | "nodes">,
) {
  return (
    input.requests.length > 0 ||
    input.compacts.length > 0 ||
    input.nodes.some((node) =>
      ["running", "sleeping", "initializing", "error"].includes(node.state),
    )
  );
}
