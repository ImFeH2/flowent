import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
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
  type StatsFilters,
  type StatsMetric,
  type StatsSortKey,
} from "@/lib/stats";
import type { StatsRange } from "@/types";
import {
  DEFAULT_STATS_FILTERS,
  DEFAULT_STATS_METRIC,
  DEFAULT_STATS_RANGE,
  DEFAULT_STATS_SORT_KEY,
  FILTER_ALL,
  emptyStatsPayload,
  hasVisibleStatsData,
  resolveStatsFilters,
} from "@/pages/stats/lib";

export function useStatsPageState() {
  const [range, setRange] = useState<StatsRange>(DEFAULT_STATS_RANGE);
  const [filters, setFilters] = useState<StatsFilters>({
    ...DEFAULT_STATS_FILTERS,
  });
  const [metric, setMetric] = useState<StatsMetric>(DEFAULT_STATS_METRIC);
  const [sortKey, setSortKey] = useState<StatsSortKey>(DEFAULT_STATS_SORT_KEY);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    ["stats", range],
    ([, currentRange]) => fetchStats(currentRange),
    {
      keepPreviousData: true,
    },
  );

  const payload = data ?? emptyStatsPayload(range);
  const filterOptions = useMemo(() => buildFilterOptions(payload), [payload]);
  const effectiveFilters = useMemo(
    () => resolveStatsFilters(filters, filterOptions),
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
  const hasVisibleStats = useMemo(
    () => hasVisibleStatsData(filtered),
    [filtered],
  );
  const isInitialLoading = isLoading && !data;
  const hasBlockingError = Boolean(error && !data);
  const hasRecoverableError = Boolean(error && data);
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const handleRangeChange = useCallback((value: string) => {
    setRange(value as StatsRange);
  }, []);

  const handleMetricChange = useCallback((value: string) => {
    setMetric(value as StatsMetric);
  }, []);

  const handleSortKeyChange = useCallback((value: string) => {
    setSortKey(value as StatsSortKey);
  }, []);

  const handleFilterChange = useCallback(
    (key: keyof StatsFilters, value: string) => {
      setFilters((current) => ({
        ...current,
        [key]: value === FILTER_ALL ? null : value,
      }));
    },
    [],
  );

  const toggleExpandedEvent = useCallback((eventId: string) => {
    setExpandedEventId((current) => (current === eventId ? null : eventId));
  }, []);

  return {
    range,
    metric,
    sortKey,
    expandedEventId,
    filterOptions,
    effectiveFilters,
    overview,
    buckets,
    providerGroups,
    tabGroups,
    agentGroups,
    recentEvents,
    hasVisibleStats,
    isLoading,
    isInitialLoading,
    hasBlockingError,
    hasRecoverableError,
    errorMessage,
    refresh,
    handleRangeChange,
    handleMetricChange,
    handleSortKeyChange,
    handleFilterChange,
    toggleExpandedEvent,
  };
}
