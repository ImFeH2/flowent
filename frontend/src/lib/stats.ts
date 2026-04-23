import type {
  AgentState,
  StatsCompactRecord,
  StatsNodeSnapshot,
  StatsPayload,
  StatsRange,
  StatsRequestRecord,
  StatsTabSnapshot,
} from "@/types";

export interface StatsFilters {
  providerId: string | null;
  model: string | null;
  tabId: string | null;
  agentId: string | null;
}

export type StatsMetric =
  | "requests"
  | "tokens"
  | "errors"
  | "latency"
  | "compacts"
  | "cache_read"
  | "cache_write"
  | "cache_hit_rate";

export type StatsSortKey =
  | "requests"
  | "tokens"
  | "errors"
  | "latency"
  | "cache_hit_rate";

export interface StatsOption {
  value: string;
  label: string;
}

export interface StatsFilterOptions {
  providers: StatsOption[];
  models: StatsOption[];
  tabs: StatsOption[];
  agents: StatsOption[];
}

export interface StatsOverview {
  activeTabs: number;
  runningAgents: number;
  llmRequests: number;
  totalTokens: number;
  errorRate: number | null;
  avgLatencyMs: number | null;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number | null;
  hasCacheUsage: boolean;
}

export interface StatsBucket {
  startMs: number;
  endMs: number;
  label: string;
  requestCount: number;
  errorCount: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  compactCount: number;
  manualCompactCount: number;
  autoCompactCount: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number | null;
}

export interface StatsModelGroup {
  key: string;
  model: string;
  requestCount: number;
  errorCount: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  retryCount: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number | null;
  lastActivityAt: number | null;
}

export interface StatsProviderGroup {
  key: string;
  providerLabel: string;
  requestCount: number;
  errorCount: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  retryCount: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number | null;
  lastActivityAt: number | null;
  models: StatsModelGroup[];
}

export interface StatsTabGroup {
  key: string;
  tabId: string | null;
  tabTitle: string;
  requestCount: number;
  errorCount: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  compactCount: number;
  runningAgents: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number | null;
}

export interface StatsAgentGroup {
  key: string;
  nodeId: string;
  agentLabel: string;
  roleName: string | null;
  tabTitle: string;
  requestCount: number;
  errorCount: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  cacheRead: number;
  cacheWrite: number;
  cacheHitRate: number | null;
  state: AgentState | null;
}

export type StatsEvent =
  | {
      key: string;
      kind: "request_error" | "request_retry";
      endedAt: number;
      tabTitle: string;
      agentLabel: string;
      providerLabel: string;
      modelLabel: string;
      result: "success" | "error";
      retryCount: number;
      errorSummary: string | null;
      request: StatsRequestRecord;
    }
  | {
      key: string;
      kind: "compact";
      endedAt: number;
      tabTitle: string;
      agentLabel: string;
      providerLabel: string;
      modelLabel: string;
      result: "success" | "error";
      compact: StatsCompactRecord;
    };

const RANGE_WINDOW_SECONDS: Record<StatsRange, number> = {
  "1h": 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

const RANGE_BUCKET_COUNT: Record<StatsRange, number> = {
  "1h": 12,
  "24h": 24,
  "7d": 28,
  "30d": 30,
};

function normalizeTimestampMs(
  timestamp: number | null | undefined,
): number | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp > 1e12 ? timestamp : timestamp * 1000;
}

function getProviderLabel(
  providerId: string | null | undefined,
  providerName: string | null | undefined,
): string {
  return providerName || providerId || "Unknown provider";
}

function getModelLabel(model: string | null | undefined): string {
  return model || "Unknown model";
}

function getTabLabel(tabTitle: string | null | undefined): string {
  return tabTitle || "Unknown workflow";
}

function getAgentLabel(label: string | null | undefined): string {
  return label || "Unknown agent";
}

function matchesFilters<
  T extends {
    provider_id?: string | null;
    model?: string | null;
    tab_id?: string | null;
    node_id?: string | null;
  },
>(record: T, filters: StatsFilters): boolean {
  if (filters.providerId && record.provider_id !== filters.providerId) {
    return false;
  }
  if (filters.model && (record.model || null) !== filters.model) {
    return false;
  }
  if (filters.tabId && (record.tab_id || null) !== filters.tabId) {
    return false;
  }
  if (filters.agentId && (record.node_id || null) !== filters.agentId) {
    return false;
  }
  return true;
}

function matchesNodeFilters(
  node: StatsNodeSnapshot,
  filters: StatsFilters,
): boolean {
  if (filters.providerId && (node.provider_id || null) !== filters.providerId) {
    return false;
  }
  if (filters.model && (node.model || null) !== filters.model) {
    return false;
  }
  if (filters.tabId && (node.tab_id || null) !== filters.tabId) {
    return false;
  }
  if (filters.agentId && node.id !== filters.agentId) {
    return false;
  }
  return true;
}

function sumKnown(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (total, value) => total + (typeof value === "number" ? value : 0),
    0,
  );
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildCacheHitRate(
  items: Array<{ cacheRead?: number | null; inputTokens?: number | null }>,
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const item of items) {
    if (
      typeof item.cacheRead === "number" &&
      typeof item.inputTokens === "number" &&
      item.inputTokens > 0
    ) {
      numerator += item.cacheRead;
      denominator += item.inputTokens;
    }
  }
  if (denominator <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

function aggregateRequestMetrics(requests: StatsRequestRecord[]) {
  const latencyValues = requests.map((request) => request.duration_ms);
  const successfulRequests = requests.filter(
    (request) => request.result === "success",
  );
  return {
    requestCount: requests.length,
    errorCount: requests.filter((request) => request.result === "error").length,
    totalTokens: sumKnown(
      successfulRequests.map(
        (request) => request.normalized_usage?.total_tokens ?? null,
      ),
    ),
    avgLatencyMs: average(latencyValues),
    retryCount: requests.reduce(
      (total, request) => total + request.retry_count,
      0,
    ),
    cacheRead: sumKnown(
      successfulRequests.map(
        (request) => request.normalized_usage?.cache_read_tokens ?? null,
      ),
    ),
    cacheWrite: sumKnown(
      successfulRequests.map(
        (request) => request.normalized_usage?.cache_write_tokens ?? null,
      ),
    ),
    cacheHitRate: buildCacheHitRate(
      successfulRequests.map((request) => ({
        cacheRead: request.normalized_usage?.cache_read_tokens ?? null,
        inputTokens: request.normalized_usage?.input_tokens ?? null,
      })),
    ),
    lastActivityAt:
      requests.length > 0
        ? Math.max(
            ...requests.map(
              (request) => normalizeTimestampMs(request.ended_at) ?? 0,
            ),
          )
        : null,
  };
}

function buildBucketLabel(startMs: number, range: StatsRange): string {
  const date = new Date(startMs);
  if (range === "1h") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (range === "24h") {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (range === "7d") {
    return date.toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
    });
  }
  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });
}

function sortOptions(options: Map<string, string>): StatsOption[] {
  return [...options.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));
}

export function buildFilterOptions(payload: StatsPayload): StatsFilterOptions {
  const providers = new Map<string, string>();
  const models = new Map<string, string>();
  const tabs = new Map<string, string>();
  const agents = new Map<string, string>();

  for (const node of payload.nodes) {
    if (node.provider_id) {
      providers.set(
        node.provider_id,
        getProviderLabel(node.provider_id, node.provider_name),
      );
    }
    if (node.model) {
      models.set(node.model, getModelLabel(node.model));
    }
    if (node.tab_id) {
      tabs.set(node.tab_id, getTabLabel(node.tab_title));
    }
    agents.set(node.id, getAgentLabel(node.label));
  }

  for (const request of payload.requests) {
    if (request.provider_id) {
      providers.set(
        request.provider_id,
        getProviderLabel(request.provider_id, request.provider_name),
      );
    }
    if (request.model) {
      models.set(request.model, getModelLabel(request.model));
    }
    if (request.tab_id) {
      tabs.set(request.tab_id, getTabLabel(request.tab_title));
    }
    agents.set(request.node_id, getAgentLabel(request.node_label));
  }

  for (const compact of payload.compacts) {
    if (compact.provider_id) {
      providers.set(
        compact.provider_id,
        getProviderLabel(compact.provider_id, compact.provider_name),
      );
    }
    if (compact.model) {
      models.set(compact.model, getModelLabel(compact.model));
    }
    if (compact.tab_id) {
      tabs.set(compact.tab_id, getTabLabel(compact.tab_title));
    }
    agents.set(compact.node_id, getAgentLabel(compact.node_label));
  }

  return {
    providers: sortOptions(providers),
    models: sortOptions(models),
    tabs: sortOptions(tabs),
    agents: sortOptions(agents),
  };
}

export function filterStatsRecords(
  payload: StatsPayload,
  filters: StatsFilters,
) {
  const requests = payload.requests.filter((record) =>
    matchesFilters(record, filters),
  );
  const compacts = payload.compacts.filter((record) =>
    matchesFilters(record, filters),
  );
  const nodes = payload.nodes.filter((node) =>
    matchesNodeFilters(node, filters),
  );
  const matchedTabIds = new Set(
    nodes
      .map((node) => node.tab_id)
      .filter(
        (tabId): tabId is string =>
          typeof tabId === "string" && tabId.length > 0,
      ),
  );
  const tabs = payload.tabs.filter((tab) => {
    if (filters.tabId) {
      return tab.id === filters.tabId;
    }
    if (filters.agentId || filters.providerId || filters.model) {
      return matchedTabIds.has(tab.id);
    }
    return true;
  });
  return { requests, compacts, nodes, tabs };
}

export function buildOverview(
  payload: StatsPayload,
  filters: StatsFilters,
  filtered: ReturnType<typeof filterStatsRecords>,
): StatsOverview {
  const runningAgents = filtered.nodes.filter(
    (node) => node.state === "running",
  ).length;
  const activeTabs = filtered.tabs.length;
  const requestMetrics = aggregateRequestMetrics(filtered.requests);
  const hasCacheUsage = filtered.requests.some(
    (request) =>
      request.normalized_usage?.cache_read_tokens != null ||
      request.normalized_usage?.cache_write_tokens != null,
  );

  const overviewFilters =
    filters.providerId || filters.model || filters.tabId || filters.agentId
      ? filtered
      : filterStatsRecords(payload, filters);

  return {
    activeTabs:
      filters.providerId || filters.model || filters.tabId || filters.agentId
        ? activeTabs
        : overviewFilters.tabs.length,
    runningAgents:
      filters.providerId || filters.model || filters.tabId || filters.agentId
        ? runningAgents
        : overviewFilters.nodes.filter((node) => node.state === "running")
            .length,
    llmRequests: requestMetrics.requestCount,
    totalTokens: requestMetrics.totalTokens,
    errorRate:
      requestMetrics.requestCount > 0
        ? requestMetrics.errorCount / requestMetrics.requestCount
        : null,
    avgLatencyMs: requestMetrics.avgLatencyMs,
    cacheRead: requestMetrics.cacheRead,
    cacheWrite: requestMetrics.cacheWrite,
    cacheHitRate: requestMetrics.cacheHitRate,
    hasCacheUsage,
  };
}

export function buildChartBuckets(
  range: StatsRange,
  requests: StatsRequestRecord[],
  compacts: StatsCompactRecord[],
  requestedAt: number,
): StatsBucket[] {
  const requestedAtMs = normalizeTimestampMs(requestedAt) ?? Date.now();
  const bucketCount = RANGE_BUCKET_COUNT[range];
  const windowMs = RANGE_WINDOW_SECONDS[range] * 1000;
  const bucketMs = Math.max(1, Math.ceil(windowMs / bucketCount));
  const startMs = requestedAtMs - windowMs;
  const buckets: StatsBucket[] = Array.from(
    { length: bucketCount },
    (_, index) => {
      const bucketStartMs = startMs + index * bucketMs;
      return {
        startMs: bucketStartMs,
        endMs: bucketStartMs + bucketMs,
        label: buildBucketLabel(bucketStartMs, range),
        requestCount: 0,
        errorCount: 0,
        totalTokens: 0,
        avgLatencyMs: null,
        compactCount: 0,
        manualCompactCount: 0,
        autoCompactCount: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cacheHitRate: null,
      } satisfies StatsBucket;
    },
  );
  const latencyBuckets = new Map<number, number[]>();
  const hitRateBuckets = new Map<
    number,
    Array<{ cacheRead?: number | null; inputTokens?: number | null }>
  >();

  const resolveIndex = (timestamp: number | null) => {
    if (
      timestamp === null ||
      timestamp < startMs ||
      timestamp > requestedAtMs
    ) {
      return null;
    }
    return Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((timestamp - startMs) / bucketMs)),
    );
  };

  for (const request of requests) {
    const index = resolveIndex(normalizeTimestampMs(request.ended_at));
    if (index === null) {
      continue;
    }
    const bucket = buckets[index];
    bucket.requestCount += 1;
    if (request.result === "error") {
      bucket.errorCount += 1;
    }
    if (request.result === "success") {
      bucket.totalTokens += request.normalized_usage?.total_tokens ?? 0;
      bucket.cacheRead += request.normalized_usage?.cache_read_tokens ?? 0;
      bucket.cacheWrite += request.normalized_usage?.cache_write_tokens ?? 0;
      const hitRateItems = hitRateBuckets.get(index) ?? [];
      hitRateItems.push({
        cacheRead: request.normalized_usage?.cache_read_tokens ?? null,
        inputTokens: request.normalized_usage?.input_tokens ?? null,
      });
      hitRateBuckets.set(index, hitRateItems);
    }
    const bucketLatencies = latencyBuckets.get(index) ?? [];
    bucketLatencies.push(request.duration_ms);
    latencyBuckets.set(index, bucketLatencies);
  }

  for (const compact of compacts) {
    const index = resolveIndex(normalizeTimestampMs(compact.ended_at));
    if (index === null) {
      continue;
    }
    const bucket = buckets[index];
    bucket.compactCount += 1;
    if (compact.trigger_type === "manual") {
      bucket.manualCompactCount += 1;
    } else {
      bucket.autoCompactCount += 1;
    }
  }

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    bucket.avgLatencyMs = average(latencyBuckets.get(index) ?? []);
    bucket.cacheHitRate = buildCacheHitRate(hitRateBuckets.get(index) ?? []);
  }

  return buckets;
}

export function buildProviderGroups(
  requests: StatsRequestRecord[],
): StatsProviderGroup[] {
  const byProvider = new Map<string, StatsRequestRecord[]>();
  for (const request of requests) {
    const providerKey = request.provider_id || "unknown-provider";
    const current = byProvider.get(providerKey) ?? [];
    current.push(request);
    byProvider.set(providerKey, current);
  }

  return [...byProvider.entries()]
    .map(([providerKey, providerRequests]) => {
      const modelMap = new Map<string, StatsRequestRecord[]>();
      for (const request of providerRequests) {
        const modelKey = request.model || "Unknown model";
        const current = modelMap.get(modelKey) ?? [];
        current.push(request);
        modelMap.set(modelKey, current);
      }
      const providerMetrics = aggregateRequestMetrics(providerRequests);
      const models = [...modelMap.entries()]
        .map(([modelKey, modelRequests]) => {
          const metrics = aggregateRequestMetrics(modelRequests);
          return {
            key: `${providerKey}:${modelKey}`,
            model: getModelLabel(modelRequests[0]?.model ?? null),
            requestCount: metrics.requestCount,
            errorCount: metrics.errorCount,
            totalTokens: metrics.totalTokens,
            avgLatencyMs: metrics.avgLatencyMs,
            retryCount: metrics.retryCount,
            cacheRead: metrics.cacheRead,
            cacheWrite: metrics.cacheWrite,
            cacheHitRate: metrics.cacheHitRate,
            lastActivityAt: metrics.lastActivityAt,
          } satisfies StatsModelGroup;
        })
        .sort((left, right) => right.requestCount - left.requestCount);
      return {
        key: providerKey,
        providerLabel: getProviderLabel(
          providerRequests[0]?.provider_id ?? null,
          providerRequests[0]?.provider_name ?? null,
        ),
        requestCount: providerMetrics.requestCount,
        errorCount: providerMetrics.errorCount,
        totalTokens: providerMetrics.totalTokens,
        avgLatencyMs: providerMetrics.avgLatencyMs,
        retryCount: providerMetrics.retryCount,
        cacheRead: providerMetrics.cacheRead,
        cacheWrite: providerMetrics.cacheWrite,
        cacheHitRate: providerMetrics.cacheHitRate,
        lastActivityAt: providerMetrics.lastActivityAt,
        models,
      } satisfies StatsProviderGroup;
    })
    .sort((left, right) => right.requestCount - left.requestCount);
}

function compareBySortKey<
  T extends {
    requestCount: number;
    totalTokens: number;
    errorCount: number;
    avgLatencyMs: number | null;
    cacheHitRate: number | null;
  },
>(left: T, right: T, sortKey: StatsSortKey): number {
  if (sortKey === "tokens") {
    return right.totalTokens - left.totalTokens;
  }
  if (sortKey === "errors") {
    return right.errorCount - left.errorCount;
  }
  if (sortKey === "latency") {
    return (right.avgLatencyMs ?? -1) - (left.avgLatencyMs ?? -1);
  }
  if (sortKey === "cache_hit_rate") {
    return (right.cacheHitRate ?? -1) - (left.cacheHitRate ?? -1);
  }
  return right.requestCount - left.requestCount;
}

export function buildTabGroups(
  requests: StatsRequestRecord[],
  compacts: StatsCompactRecord[],
  nodes: StatsNodeSnapshot[],
  tabs: StatsTabSnapshot[],
  sortKey: StatsSortKey,
): StatsTabGroup[] {
  const requestMap = new Map<string, StatsRequestRecord[]>();
  for (const request of requests) {
    const key = request.tab_id || "unknown-tab";
    const current = requestMap.get(key) ?? [];
    current.push(request);
    requestMap.set(key, current);
  }
  const compactCountByTab = new Map<string, number>();
  for (const compact of compacts) {
    const key = compact.tab_id || "unknown-tab";
    compactCountByTab.set(key, (compactCountByTab.get(key) ?? 0) + 1);
  }
  const runningByTab = new Map<string, number>();
  for (const node of nodes) {
    if (!node.tab_id || node.state !== "running") {
      continue;
    }
    runningByTab.set(node.tab_id, (runningByTab.get(node.tab_id) ?? 0) + 1);
  }

  const knownTabIds = new Set([
    ...tabs.map((tab) => tab.id),
    ...requestMap.keys(),
    ...compactCountByTab.keys(),
  ]);

  return [...knownTabIds]
    .map((tabId) => {
      const tab = tabs.find((item) => item.id === tabId) ?? null;
      const metrics = aggregateRequestMetrics(requestMap.get(tabId) ?? []);
      return {
        key: tabId,
        tabId: tab?.id ?? null,
        tabTitle: getTabLabel(
          tab?.title ?? requestMap.get(tabId)?.[0]?.tab_title ?? null,
        ),
        requestCount: metrics.requestCount,
        errorCount: metrics.errorCount,
        totalTokens: metrics.totalTokens,
        avgLatencyMs: metrics.avgLatencyMs,
        compactCount: compactCountByTab.get(tabId) ?? 0,
        runningAgents: runningByTab.get(tabId) ?? 0,
        cacheRead: metrics.cacheRead,
        cacheWrite: metrics.cacheWrite,
        cacheHitRate: metrics.cacheHitRate,
      } satisfies StatsTabGroup;
    })
    .sort((left, right) => compareBySortKey(left, right, sortKey));
}

export function buildAgentGroups(
  requests: StatsRequestRecord[],
  nodes: StatsNodeSnapshot[],
  sortKey: StatsSortKey,
): StatsAgentGroup[] {
  const requestMap = new Map<string, StatsRequestRecord[]>();
  for (const request of requests) {
    const current = requestMap.get(request.node_id) ?? [];
    current.push(request);
    requestMap.set(request.node_id, current);
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const knownNodeIds = new Set([...nodeMap.keys(), ...requestMap.keys()]);

  return [...knownNodeIds]
    .map((nodeId) => {
      const node = nodeMap.get(nodeId) ?? null;
      const metrics = aggregateRequestMetrics(requestMap.get(nodeId) ?? []);
      return {
        key: nodeId,
        nodeId,
        agentLabel: getAgentLabel(
          node?.label ?? requestMap.get(nodeId)?.[0]?.node_label ?? null,
        ),
        roleName:
          node?.role_name ?? requestMap.get(nodeId)?.[0]?.role_name ?? null,
        tabTitle: getTabLabel(
          node?.tab_title ?? requestMap.get(nodeId)?.[0]?.tab_title ?? null,
        ),
        requestCount: metrics.requestCount,
        errorCount: metrics.errorCount,
        totalTokens: metrics.totalTokens,
        avgLatencyMs: metrics.avgLatencyMs,
        cacheRead: metrics.cacheRead,
        cacheWrite: metrics.cacheWrite,
        cacheHitRate: metrics.cacheHitRate,
        state: node?.state ?? null,
      } satisfies StatsAgentGroup;
    })
    .sort((left, right) => compareBySortKey(left, right, sortKey));
}

export function buildRecentEvents(
  requests: StatsRequestRecord[],
  compacts: StatsCompactRecord[],
): StatsEvent[] {
  const events: StatsEvent[] = [];
  for (const request of requests) {
    if (request.result === "error") {
      events.push({
        key: request.id,
        kind: "request_error",
        endedAt: normalizeTimestampMs(request.ended_at) ?? 0,
        tabTitle: getTabLabel(request.tab_title),
        agentLabel: getAgentLabel(request.node_label),
        providerLabel: getProviderLabel(
          request.provider_id,
          request.provider_name,
        ),
        modelLabel: getModelLabel(request.model),
        result: request.result,
        retryCount: request.retry_count,
        errorSummary: request.error_summary ?? null,
        request,
      });
      continue;
    }
    if (request.retry_count > 0) {
      events.push({
        key: request.id,
        kind: "request_retry",
        endedAt: normalizeTimestampMs(request.ended_at) ?? 0,
        tabTitle: getTabLabel(request.tab_title),
        agentLabel: getAgentLabel(request.node_label),
        providerLabel: getProviderLabel(
          request.provider_id,
          request.provider_name,
        ),
        modelLabel: getModelLabel(request.model),
        result: request.result,
        retryCount: request.retry_count,
        errorSummary: request.error_summary ?? null,
        request,
      });
    }
  }
  for (const compact of compacts) {
    events.push({
      key: compact.id,
      kind: "compact",
      endedAt: normalizeTimestampMs(compact.ended_at) ?? 0,
      tabTitle: getTabLabel(compact.tab_title),
      agentLabel: getAgentLabel(compact.node_label),
      providerLabel: getProviderLabel(
        compact.provider_id,
        compact.provider_name,
      ),
      modelLabel: getModelLabel(compact.model),
      result: compact.result,
      compact,
    });
  }
  return events.sort((left, right) => right.endedAt - left.endedAt);
}

export function getBucketMetricValue(
  bucket: StatsBucket,
  metric: StatsMetric,
): number | null {
  if (metric === "tokens") {
    return bucket.totalTokens;
  }
  if (metric === "errors") {
    return bucket.errorCount;
  }
  if (metric === "latency") {
    return bucket.avgLatencyMs;
  }
  if (metric === "compacts") {
    return bucket.compactCount;
  }
  if (metric === "cache_read") {
    return bucket.cacheRead;
  }
  if (metric === "cache_write") {
    return bucket.cacheWrite;
  }
  if (metric === "cache_hit_rate") {
    return bucket.cacheHitRate;
  }
  return bucket.requestCount;
}
