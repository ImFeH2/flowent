import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  Activity,
  AlertTriangle,
  Bot,
  ChartColumnBig,
  Clock3,
  Database,
  FileWarning,
  Gauge,
  Layers3,
  RefreshCw,
  Server,
  Sparkles,
  Workflow,
} from "lucide-react";
import { fetchStats } from "@/lib/api";
import {
  buildAgentGroups,
  buildChartBuckets,
  buildFilterOptions,
  buildOverview,
  buildProviderGroups,
  buildRecentEvents,
  buildTabGroups,
  filterStatsRecords,
  getBucketMetricValue,
  type StatsBucket,
  type StatsEvent,
  type StatsFilters,
  type StatsMetric,
  type StatsSortKey,
} from "@/lib/stats";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import { Button } from "@/components/ui/button";
import { formatLocalTimestamp } from "@/lib/datetime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { stateBadgeColor } from "@/lib/constants";
import type { StatsPayload, StatsRange } from "@/types";

const RANGE_OPTIONS: Array<{ value: StatsRange; label: string }> = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const FILTER_ALL = "__all__";

const METRIC_OPTIONS: Array<{ value: StatsMetric; label: string }> = [
  { value: "requests", label: "Requests" },
  { value: "tokens", label: "Tokens" },
  { value: "errors", label: "Errors" },
  { value: "latency", label: "Latency" },
  { value: "compacts", label: "Compacts" },
  { value: "cache_read", label: "Cache Read" },
  { value: "cache_write", label: "Cache Write" },
  { value: "cache_hit_rate", label: "Cache Hit Rate" },
];

const SORT_OPTIONS: Array<{ value: StatsSortKey; label: string }> = [
  { value: "requests", label: "Requests" },
  { value: "tokens", label: "Tokens" },
  { value: "errors", label: "Errors" },
  { value: "latency", label: "Latency" },
  { value: "cache_hit_rate", label: "Cache Hit Rate" },
];

const statsSelectTriggerClass =
  "h-8 rounded-md bg-background/50 text-foreground";
const statsFilterLabelClass =
  "text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80";

function formatTimestamp(timestamp: number | null | undefined): string {
  return formatLocalTimestamp(timestamp, { fallback: "Unknown" });
}

function formatInteger(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  return value.toLocaleString();
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

function formatRate(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function findLastActiveBucketIndex(buckets: StatsBucket[]): number {
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const bucket = buckets[index];
    if (bucket.requestCount > 0 || bucket.compactCount > 0) {
      return index;
    }
  }
  return Math.max(buckets.length - 1, 0);
}

function emptyPayload(range: StatsRange): StatsPayload {
  return {
    requested_at: Date.now(),
    range,
    tabs: [],
    nodes: [],
    requests: [],
    compacts: [],
  };
}

function StatsLoadingState() {
  return (
    <div className="space-y-5">
      <SoftPanel>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded-full skeleton-shimmer" />
            <div className="h-8 w-52 rounded-full skeleton-shimmer" />
          </div>
          <div className="h-9 w-32 rounded-full skeleton-shimmer" />
        </div>
      </SoftPanel>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SoftPanel key={index} className="space-y-3">
            <div className="h-3 w-20 rounded-full skeleton-shimmer" />
            <div className="h-8 w-28 rounded-full skeleton-shimmer" />
            <div className="h-3 w-32 rounded-full skeleton-shimmer" />
          </SoftPanel>
        ))}
      </div>
      <SoftPanel className="space-y-4">
        <div className="h-3 w-28 rounded-full skeleton-shimmer" />
        <div className="h-[220px] rounded-xl skeleton-shimmer" />
        <p className="text-sm text-muted-foreground">Loading stats...</p>
      </SoftPanel>
    </div>
  );
}

function StatsEmptyState() {
  return (
    <SoftPanel className="flex min-h-[280px] flex-col items-center justify-center text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-accent/20 text-muted-foreground">
        <ChartColumnBig className="size-5" />
      </div>
      <h2 className="mt-5 text-xl font-medium text-foreground">No stats yet</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
        There are no request records, compact records, or current runtime
        activity in the selected range.
      </p>
    </SoftPanel>
  );
}

function StatsErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <SoftPanel className="flex min-h-[280px] flex-col items-center justify-center text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <h2 className="mt-5 text-xl font-medium text-foreground">
        Failed to load stats
      </h2>
      <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-5 border-border bg-accent/20 text-foreground hover:bg-accent/35"
        onClick={onRetry}
      >
        Retry
      </Button>
    </SoftPanel>
  );
}

function StatsValueCard({
  title,
  value,
  description,
  icon: Icon,
  accentClassName,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Activity;
  accentClassName?: string;
}) {
  return (
    <SoftPanel className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-border" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-3 text-[28px] font-medium tracking-[-0.04em] text-foreground">
            {value}
          </p>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg border border-border bg-accent/20 text-muted-foreground",
            accentClassName,
          )}
        >
          <Icon className="size-4.5" />
        </div>
      </div>
    </SoftPanel>
  );
}

function StatsTrendChart({
  buckets,
  metric,
}: {
  buckets: StatsBucket[];
  metric: StatsMetric;
}) {
  const [activeIndex, setActiveIndex] = useState(() =>
    findLastActiveBucketIndex(buckets),
  );

  useEffect(() => {
    setActiveIndex(findLastActiveBucketIndex(buckets));
  }, [buckets]);

  if (buckets.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-border bg-card/30 text-[13px] text-muted-foreground">
        No trend data in the selected range.
      </div>
    );
  }

  const values = buckets.map(
    (bucket) => getBucketMetricValue(bucket, metric) ?? 0,
  );
  const maxValue =
    metric === "cache_hit_rate"
      ? 1
      : Math.max(1, ...values, ...buckets.map((bucket) => bucket.compactCount));
  const activeBucket =
    buckets[Math.min(activeIndex, buckets.length - 1)] ?? buckets[0];
  const width = 1000;
  const height = 220;
  const paddingX = 18;
  const chartWidth = width - paddingX * 2;
  const chartHeight = 146;
  const barWidth = chartWidth / buckets.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card/30 px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {METRIC_OPTIONS.find((option) => option.value === metric)?.label}
          </p>
          <p className="mt-2 text-sm text-foreground">
            {formatTimestamp(activeBucket.startMs)} to{" "}
            {formatTimestamp(activeBucket.endMs)}
          </p>
        </div>
        <div className="grid gap-x-5 gap-y-2 text-[12px] text-muted-foreground sm:grid-cols-4">
          <span>Requests {formatInteger(activeBucket.requestCount)}</span>
          <span>Failures {formatInteger(activeBucket.errorCount)}</span>
          <span>Tokens {formatInteger(activeBucket.totalTokens)}</span>
          <span>
            Compacts{" "}
            {formatInteger(
              activeBucket.manualCompactCount + activeBucket.autoCompactCount,
            )}
          </span>
          <span>Cache Read {formatInteger(activeBucket.cacheRead)}</span>
          <span>Cache Write {formatInteger(activeBucket.cacheWrite)}</span>
          <span>Avg Latency {formatDuration(activeBucket.avgLatencyMs)}</span>
          <span>Hit Rate {formatRate(activeBucket.cacheHitRate)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/25 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
          {Array.from({ length: 5 }).map((_, index) => {
            const y = 20 + (chartHeight / 4) * index;
            return (
              <line
                key={index}
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="var(--graph-grid)"
                strokeWidth="1"
              />
            );
          })}

          {buckets.map((bucket, index) => {
            const value = getBucketMetricValue(bucket, metric) ?? 0;
            const totalCompactValue =
              bucket.manualCompactCount + bucket.autoCompactCount;
            const normalizedHeight =
              metric === "compacts"
                ? (totalCompactValue / maxValue) * chartHeight
                : (value / maxValue) * chartHeight;
            const x = paddingX + index * barWidth + barWidth * 0.15;
            const y = 20 + chartHeight - normalizedHeight;

            if (metric === "compacts") {
              const manualHeight =
                maxValue > 0
                  ? (bucket.manualCompactCount / maxValue) * chartHeight
                  : 0;
              const autoHeight =
                maxValue > 0
                  ? (bucket.autoCompactCount / maxValue) * chartHeight
                  : 0;
              return (
                <g key={bucket.startMs}>
                  <rect
                    x={x}
                    y={20 + chartHeight - autoHeight}
                    width={Math.max(8, barWidth * 0.7)}
                    height={Math.max(
                      autoHeight,
                      bucket.autoCompactCount > 0 ? 2 : 0,
                    )}
                    rx="8"
                    fill="var(--primary)"
                    fillOpacity="0.78"
                  />
                  <rect
                    x={x}
                    y={20 + chartHeight - autoHeight - manualHeight}
                    width={Math.max(8, barWidth * 0.7)}
                    height={Math.max(
                      manualHeight,
                      bucket.manualCompactCount > 0 ? 2 : 0,
                    )}
                    rx="8"
                    fill="var(--graph-status-idle)"
                    fillOpacity="0.78"
                  />
                </g>
              );
            }

            const fillColor =
              metric === "errors"
                ? "var(--graph-status-error)"
                : metric === "latency"
                  ? "var(--graph-status-idle)"
                  : metric === "cache_hit_rate"
                    ? "var(--graph-status-running)"
                    : metric === "cache_read" || metric === "cache_write"
                      ? "var(--primary)"
                      : "var(--foreground)";

            return (
              <rect
                key={bucket.startMs}
                x={x}
                y={y}
                width={Math.max(8, barWidth * 0.7)}
                height={Math.max(normalizedHeight, value > 0 ? 2 : 0)}
                rx="10"
                fill={fillColor}
                fillOpacity={metric === "errors" ? "0.82" : "0.78"}
              />
            );
          })}

          {buckets.map((bucket, index) => {
            const x = paddingX + index * barWidth;
            const isActive = activeIndex === index;
            return (
              <g key={`${bucket.startMs}-overlay`}>
                {isActive ? (
                  <rect
                    x={x}
                    y={12}
                    width={barWidth}
                    height={chartHeight + 16}
                    rx="14"
                    fill="var(--accent)"
                    fillOpacity="0.35"
                  />
                ) : null}
                <rect
                  x={x}
                  y={10}
                  width={barWidth}
                  height={chartHeight + 22}
                  fill="transparent"
                  onMouseEnter={() => setActiveIndex(index)}
                />
              </g>
            );
          })}

          {buckets.map((bucket, index) => {
            const shouldShow =
              index === 0 ||
              index === buckets.length - 1 ||
              index % Math.max(1, Math.floor(buckets.length / 6)) === 0;
            if (!shouldShow) {
              return null;
            }
            const x = paddingX + index * barWidth + barWidth * 0.5;
            return (
              <text
                key={`${bucket.startMs}-label`}
                x={x}
                y={height - 12}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fillOpacity="0.8"
                fontSize="10"
              >
                {bucket.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function StatsSectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function EventDetail({ event }: { event: StatsEvent }) {
  if (event.kind === "compact") {
    return (
      <div className="grid gap-3 rounded-xl border border-border bg-card/30 p-4 text-[12px] text-muted-foreground sm:grid-cols-2">
        <span>Trigger {event.compact.trigger_type}</span>
        <span>Duration {formatDuration(event.compact.duration_ms)}</span>
        <span>Result {event.compact.result}</span>
        <span>Error {event.compact.error_summary || "None"}</span>
      </div>
    );
  }

  const usage = event.request.normalized_usage;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/30 p-4">
      <div className="grid gap-3 text-[12px] text-muted-foreground sm:grid-cols-3">
        <span>Duration {formatDuration(event.request.duration_ms)}</span>
        <span>Retries {formatInteger(event.request.retry_count)}</span>
        <span>Result {event.request.result}</span>
        <span>Input {formatInteger(usage?.input_tokens ?? null)}</span>
        <span>Output {formatInteger(usage?.output_tokens ?? null)}</span>
        <span>Total {formatInteger(usage?.total_tokens ?? null)}</span>
        <span>
          Cache Read {formatInteger(usage?.cache_read_tokens ?? null)}
        </span>
        <span>
          Cache Write {formatInteger(usage?.cache_write_tokens ?? null)}
        </span>
        <span>
          Cache Hit Rate{" "}
          {formatRate(
            typeof usage?.cache_read_tokens === "number" &&
              typeof usage?.input_tokens === "number" &&
              usage.input_tokens > 0
              ? usage.cache_read_tokens / usage.input_tokens
              : null,
          )}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Normalized Usage
          </p>
          <pre className="max-h-[240px] overflow-auto rounded-xl border border-border bg-background/50 p-4 text-[11px] leading-6 text-foreground/75">
            {JSON.stringify(event.request.normalized_usage ?? null, null, 2)}
          </pre>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Raw Usage
          </p>
          <pre className="max-h-[240px] overflow-auto rounded-xl border border-border bg-background/50 p-4 text-[11px] leading-6 text-foreground/75">
            {JSON.stringify(event.request.raw_usage ?? null, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function StatsPage() {
  const [range, setRange] = useState<StatsRange>("24h");
  const [filters, setFilters] = useState<StatsFilters>({
    providerId: null,
    model: null,
    tabId: null,
    agentId: null,
  });
  const [metric, setMetric] = useState<StatsMetric>("requests");
  const [sortKey, setSortKey] = useState<StatsSortKey>("requests");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    ["stats", range],
    ([, currentRange]) => fetchStats(currentRange),
    {
      keepPreviousData: true,
    },
  );

  const payload = data ?? emptyPayload(range);
  const filterOptions = useMemo(() => buildFilterOptions(payload), [payload]);
  const effectiveFilters = useMemo(
    () =>
      ({
        providerId:
          filters.providerId &&
          filterOptions.providers.some(
            (option) => option.value === filters.providerId,
          )
            ? filters.providerId
            : null,
        model:
          filters.model &&
          filterOptions.models.some((option) => option.value === filters.model)
            ? filters.model
            : null,
        tabId:
          filters.tabId &&
          filterOptions.tabs.some((option) => option.value === filters.tabId)
            ? filters.tabId
            : null,
        agentId:
          filters.agentId &&
          filterOptions.agents.some(
            (option) => option.value === filters.agentId,
          )
            ? filters.agentId
            : null,
      }) satisfies StatsFilters,
    [filterOptions, filters],
  );

  const filtered = useMemo(
    () => filterStatsRecords(payload, effectiveFilters),
    [effectiveFilters, payload],
  );
  const overview = useMemo(
    () => buildOverview(payload, effectiveFilters, filtered),
    [effectiveFilters, filtered, payload],
  );
  const buckets = useMemo(
    () =>
      buildChartBuckets(
        payload.range,
        filtered.requests,
        filtered.compacts,
        payload.requested_at,
      ),
    [filtered.compacts, filtered.requests, payload.range, payload.requested_at],
  );
  const providerGroups = useMemo(
    () => buildProviderGroups(filtered.requests),
    [filtered.requests],
  );
  const tabGroups = useMemo(
    () =>
      buildTabGroups(
        filtered.requests,
        filtered.compacts,
        filtered.nodes,
        filtered.tabs,
        sortKey,
      ),
    [
      filtered.compacts,
      filtered.nodes,
      filtered.requests,
      filtered.tabs,
      sortKey,
    ],
  );
  const agentGroups = useMemo(
    () => buildAgentGroups(filtered.requests, filtered.nodes, sortKey),
    [filtered.nodes, filtered.requests, sortKey],
  );
  const recentEvents = useMemo(
    () => buildRecentEvents(filtered.requests, filtered.compacts),
    [filtered.compacts, filtered.requests],
  );

  const hasVisibleStats =
    filtered.requests.length > 0 ||
    filtered.compacts.length > 0 ||
    filtered.nodes.some((node) =>
      ["running", "sleeping", "initializing", "error"].includes(node.state),
    );

  const overviewCards = [
    {
      title: "Active Tabs",
      value: formatInteger(overview.activeTabs),
      description:
        "Current tabs that still exist and match the selected scope.",
      icon: Layers3,
    },
    {
      title: "Running Agents",
      value: formatInteger(overview.runningAgents),
      description: "Current nodes whose stable state is running right now.",
      icon: Bot,
    },
    {
      title: "LLM Requests",
      value: formatInteger(overview.llmRequests),
      description:
        "Formal request rounds. Internal retries still count as one request.",
      icon: Sparkles,
    },
    {
      title: "Total Tokens",
      value: formatInteger(overview.totalTokens),
      description: "Aggregated real token usage from successful requests only.",
      icon: Workflow,
    },
    {
      title: "Error Rate",
      value: formatRate(overview.errorRate),
      description:
        "Failed requests divided by all requests in the selected scope.",
      icon: FileWarning,
      accentClassName: "text-destructive",
    },
    {
      title: "Avg Latency",
      value: formatDuration(overview.avgLatencyMs),
      description: "Average full-request duration, not a single retry attempt.",
      icon: Clock3,
      accentClassName: "text-graph-status-idle",
    },
    ...(overview.hasCacheUsage
      ? [
          {
            title: "Cache Read",
            value: formatInteger(overview.cacheRead),
            description:
              "Normalized cache hit tokens returned by providers when known.",
            icon: Database,
            accentClassName: "text-graph-status-running",
          },
          {
            title: "Cache Write",
            value: formatInteger(overview.cacheWrite),
            description:
              "Normalized cache creation or write tokens when known.",
            icon: Server,
            accentClassName: "text-primary",
          },
          {
            title: "Cache Hit Rate",
            value: formatRate(overview.cacheHitRate),
            description:
              "Derived only when both cache-hit tokens and a reliable input denominator are known.",
            icon: Gauge,
            accentClassName: "text-graph-status-running",
          },
        ]
      : []),
  ];

  return (
    <PageScaffold className="min-h-0">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                Global Observability
              </p>
              <h1 className="mt-2 text-[28px] font-medium tracking-[-0.04em] text-foreground">
                Stats
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
                Review formal runtime facts across requests, retries, compacts,
                cache usage, and current node activity without narrowing to a
                single task conversation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className={statsFilterLabelClass}>Range</span>
                <Select
                  value={range}
                  onValueChange={(value: StatsRange) => setRange(value)}
                >
                  <SelectTrigger
                    className={`w-[120px] ${statsSelectTriggerClass}`}
                  >
                    <SelectValue placeholder="Range" />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-5 border-border bg-accent/20 text-foreground hover:bg-accent/35"
                onClick={() => void mutate()}
              >
                <RefreshCw
                  className={cn("size-4", isLoading && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <span className={statsFilterLabelClass}>Provider</span>
              <Select
                value={effectiveFilters.providerId ?? FILTER_ALL}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    providerId: value === FILTER_ALL ? null : value,
                  }))
                }
              >
                <SelectTrigger className={`w-full ${statsSelectTriggerClass}`}>
                  <SelectValue placeholder="All Providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All Providers</SelectItem>
                  {filterOptions.providers.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className={statsFilterLabelClass}>Model</span>
              <Select
                value={effectiveFilters.model ?? FILTER_ALL}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    model: value === FILTER_ALL ? null : value,
                  }))
                }
              >
                <SelectTrigger className={`w-full ${statsSelectTriggerClass}`}>
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All Models</SelectItem>
                  {filterOptions.models.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className={statsFilterLabelClass}>Tab</span>
              <Select
                value={effectiveFilters.tabId ?? FILTER_ALL}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    tabId: value === FILTER_ALL ? null : value,
                  }))
                }
              >
                <SelectTrigger className={`w-full ${statsSelectTriggerClass}`}>
                  <SelectValue placeholder="All Tabs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All Tabs</SelectItem>
                  {filterOptions.tabs.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className={statsFilterLabelClass}>Agent</span>
              <Select
                value={effectiveFilters.agentId ?? FILTER_ALL}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    agentId: value === FILTER_ALL ? null : value,
                  }))
                }
              >
                <SelectTrigger className={`w-full ${statsSelectTriggerClass}`}>
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>All Agents</SelectItem>
                  {filterOptions.agents.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {isLoading && !data ? (
            <StatsLoadingState />
          ) : error && !data ? (
            <StatsErrorState
              message={error instanceof Error ? error.message : "Unknown error"}
              onRetry={() => void mutate()}
            />
          ) : !hasVisibleStats ? (
            <StatsEmptyState />
          ) : (
            <div className="space-y-6">
              {error ? (
                <SoftPanel className="border-destructive/12 bg-destructive/6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-xl border border-destructive/16 bg-destructive/10 text-destructive">
                        <AlertTriangle className="size-4" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">
                          Stats refresh failed
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          Showing the last successful response. Retry when
                          ready.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-border bg-accent/20 text-foreground hover:bg-accent/35"
                      onClick={() => void mutate()}
                    >
                      Retry
                    </Button>
                  </div>
                </SoftPanel>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {overviewCards.map((card) => (
                  <StatsValueCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    description={card.description}
                    icon={card.icon}
                    accentClassName={card.accentClassName}
                  />
                ))}
              </div>

              <SoftPanel className="overflow-hidden">
                <StatsSectionTitle
                  title="Trend"
                  description="Switch between request, token, error, latency, compact, and cache metrics over time."
                  action={
                    <Select
                      value={metric}
                      onValueChange={(value: StatsMetric) => setMetric(value)}
                    >
                      <SelectTrigger
                        className={`w-[180px] ${statsSelectTriggerClass}`}
                      >
                        <SelectValue placeholder="Metric" />
                      </SelectTrigger>
                      <SelectContent>
                        {METRIC_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <StatsTrendChart buckets={buckets} metric={metric} />
              </SoftPanel>

              <div className="grid gap-6 xl:grid-cols-2">
                <SoftPanel className="overflow-hidden">
                  <StatsSectionTitle
                    title="By Provider / Model"
                    description="Request aggregates grouped by provider and then by concrete model."
                  />
                  <div className="space-y-4">
                    {providerGroups.length === 0 ? (
                      <div className="rounded-xl border border-border bg-card/30 px-4 py-6 text-[13px] text-muted-foreground">
                        No request data matches the current scope.
                      </div>
                    ) : (
                      providerGroups.map((provider) => (
                        <div
                          key={provider.key}
                          className="rounded-xl border border-border bg-card/30 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[14px] font-medium text-foreground">
                                {provider.providerLabel}
                              </p>
                              <p className="mt-1 text-[12px] text-muted-foreground">
                                Requests {formatInteger(provider.requestCount)}{" "}
                                · Errors {formatInteger(provider.errorCount)} ·
                                Tokens {formatInteger(provider.totalTokens)} ·
                                Avg {formatDuration(provider.avgLatencyMs)} ·
                                Retries {formatInteger(provider.retryCount)}
                              </p>
                            </div>
                            <div className="text-right text-[12px] text-muted-foreground">
                              <p>
                                Cache Read {formatInteger(provider.cacheRead)}
                              </p>
                              <p>
                                Cache Write {formatInteger(provider.cacheWrite)}
                              </p>
                              <p>
                                Hit Rate {formatRate(provider.cacheHitRate)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2">
                            {provider.models.map((model) => (
                              <div
                                key={model.key}
                                className="grid gap-2 rounded-xl border border-border bg-accent/15 px-3.5 py-3 text-[12px] text-muted-foreground md:grid-cols-[minmax(0,1.2fr)_repeat(6,minmax(0,0.8fr))]"
                              >
                                <span className="font-medium text-foreground">
                                  {model.model}
                                </span>
                                <span>
                                  Req {formatInteger(model.requestCount)}
                                </span>
                                <span>
                                  Err {formatInteger(model.errorCount)}
                                </span>
                                <span>
                                  Tok {formatInteger(model.totalTokens)}
                                </span>
                                <span>
                                  Avg {formatDuration(model.avgLatencyMs)}
                                </span>
                                <span>
                                  Cache {formatInteger(model.cacheRead)}
                                </span>
                                <span>
                                  Hit {formatRate(model.cacheHitRate)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SoftPanel>

                <div className="space-y-6">
                  <SoftPanel className="overflow-hidden">
                    <StatsSectionTitle
                      title="By Tab / Agent"
                      description="Current activity and historical request aggregates grouped by task tab and by node."
                      action={
                        <Select
                          value={sortKey}
                          onValueChange={(value: StatsSortKey) =>
                            setSortKey(value)
                          }
                        >
                          <SelectTrigger
                            className={`w-[170px] ${statsSelectTriggerClass}`}
                          >
                            <SelectValue placeholder="Sort" />
                          </SelectTrigger>
                          <SelectContent>
                            {SORT_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      }
                    />
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                          Tabs
                        </p>
                        {tabGroups.length === 0 ? (
                          <div className="rounded-xl border border-border bg-card/30 px-4 py-6 text-[13px] text-muted-foreground">
                            No matching tab aggregates.
                          </div>
                        ) : (
                          tabGroups.map((tab) => (
                            <div
                              key={tab.key}
                              className="grid gap-2 rounded-xl border border-border bg-card/30 px-4 py-3 text-[12px] text-muted-foreground md:grid-cols-[minmax(0,1.15fr)_repeat(6,minmax(0,0.75fr))]"
                            >
                              <span className="font-medium text-foreground">
                                {tab.tabTitle}
                              </span>
                              <span>Req {formatInteger(tab.requestCount)}</span>
                              <span>Err {formatInteger(tab.errorCount)}</span>
                              <span>Tok {formatInteger(tab.totalTokens)}</span>
                              <span>Cmp {formatInteger(tab.compactCount)}</span>
                              <span>
                                Run {formatInteger(tab.runningAgents)}
                              </span>
                              <span>Hit {formatRate(tab.cacheHitRate)}</span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                          Agents
                        </p>
                        {agentGroups.length === 0 ? (
                          <div className="rounded-xl border border-border bg-card/30 px-4 py-6 text-[13px] text-muted-foreground">
                            No matching agent aggregates.
                          </div>
                        ) : (
                          agentGroups.map((agent) => (
                            <div
                              key={agent.key}
                              className="grid gap-2 rounded-xl border border-border bg-card/30 px-4 py-3 text-[12px] text-muted-foreground md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_repeat(5,minmax(0,0.72fr))]"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">
                                  {agent.agentLabel}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground/80">
                                  {agent.roleName || "No role"} ·{" "}
                                  {agent.tabTitle}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "inline-flex h-fit w-fit rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                                  agent.state
                                    ? stateBadgeColor[agent.state]
                                    : "border-border bg-accent/25 text-muted-foreground",
                                )}
                              >
                                {agent.state || "unknown"}
                              </span>
                              <span>
                                Req {formatInteger(agent.requestCount)}
                              </span>
                              <span>Err {formatInteger(agent.errorCount)}</span>
                              <span>
                                Tok {formatInteger(agent.totalTokens)}
                              </span>
                              <span>
                                Avg {formatDuration(agent.avgLatencyMs)}
                              </span>
                              <span>
                                Cache {formatInteger(agent.cacheRead)}
                              </span>
                              <span>Hit {formatRate(agent.cacheHitRate)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </SoftPanel>
                </div>
              </div>

              <SoftPanel className="overflow-hidden">
                <StatsSectionTitle
                  title="Recent Events"
                  description="Failed requests, retried requests, and manual or automatic compact records."
                />
                <div className="space-y-2">
                  {recentEvents.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card/30 px-4 py-6 text-[13px] text-muted-foreground">
                      No recent events match the current scope.
                    </div>
                  ) : (
                    recentEvents.map((event) => {
                      const isExpanded = expandedEventId === event.key;
                      let summaryText = "";
                      if (event.kind === "compact") {
                        summaryText = `${event.compact.trigger_type} compact ${event.compact.result}`;
                      } else if (event.kind === "request_error") {
                        summaryText = `Request failed${event.retryCount > 0 ? ` after ${event.retryCount} retries` : ""}`;
                      } else {
                        summaryText = `Retried ${event.retryCount} time${event.retryCount === 1 ? "" : "s"}`;
                      }
                      return (
                        <div key={event.key} className="space-y-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="grid h-auto w-full gap-3 rounded-xl border border-border bg-card/30 px-4 py-3 text-left text-[12px] text-muted-foreground hover:bg-accent/20 hover:text-inherit md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.25fr)]"
                            onClick={() =>
                              setExpandedEventId((current) =>
                                current === event.key ? null : event.key,
                              )
                            }
                          >
                            <span className="text-foreground/85">
                              {formatTimestamp(event.endedAt)}
                            </span>
                            <span className="truncate">{event.tabTitle}</span>
                            <span className="truncate">{event.agentLabel}</span>
                            <span className="truncate">
                              {event.providerLabel} / {event.modelLabel}
                            </span>
                            <span
                              className={cn(
                                "truncate",
                                event.kind === "request_error"
                                  ? "text-destructive"
                                  : event.kind === "compact"
                                    ? "text-graph-status-idle"
                                    : "text-graph-status-running",
                              )}
                            >
                              {summaryText}
                            </span>
                          </Button>
                          {isExpanded ? <EventDetail event={event} /> : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </SoftPanel>
            </div>
          )}
        </div>
      </div>
    </PageScaffold>
  );
}
