import { describe, expect, it } from "vitest";
import {
  buildChartBuckets,
  buildOverview,
  buildProviderGroups,
  buildRecentEvents,
  filterStatsRecords,
  type StatsFilters,
} from "@/lib/stats";
import type {
  StatsCompactRecord,
  StatsNodeSnapshot,
  StatsPayload,
  StatsRequestRecord,
  StatsTabSnapshot,
} from "@/types";

function buildTab(overrides: Partial<StatsTabSnapshot> = {}): StatsTabSnapshot {
  return {
    id: "tab-1",
    title: "Main Task",
    goal: "",
    leader_id: "leader-1",
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

function buildNode(
  overrides: Partial<StatsNodeSnapshot> = {},
): StatsNodeSnapshot {
  return {
    id: "leader-1",
    label: "Leader",
    name: "Leader",
    role_name: "Conductor",
    node_type: "agent",
    is_leader: true,
    state: "running",
    tab_id: "tab-1",
    tab_title: "Main Task",
    provider_id: "provider-1",
    provider_name: "Primary",
    provider_type: "openai_responses",
    model: "gpt-5.2",
    ...overrides,
  };
}

function buildRequest(
  overrides: Partial<StatsRequestRecord> = {},
): StatsRequestRecord {
  return {
    id: "req-1",
    node_id: "leader-1",
    node_label: "Leader",
    role_name: "Conductor",
    tab_id: "tab-1",
    tab_title: "Main Task",
    provider_id: "provider-1",
    provider_name: "Primary",
    provider_type: "openai_responses",
    model: "gpt-5.2",
    started_at: 1_760_000_000 - 20,
    ended_at: 1_760_000_000 - 19,
    duration_ms: 900,
    retry_count: 0,
    result: "success",
    error_summary: null,
    normalized_usage: {
      total_tokens: 100,
      input_tokens: 80,
      output_tokens: 20,
      cached_input_tokens: 16,
      cache_read_tokens: 16,
      cache_write_tokens: 4,
      details: {},
    },
    raw_usage: { total_tokens: 100 },
    ...overrides,
  };
}

function buildCompact(
  overrides: Partial<StatsCompactRecord> = {},
): StatsCompactRecord {
  return {
    id: "cmp-1",
    node_id: "leader-1",
    node_label: "Leader",
    role_name: "Conductor",
    tab_id: "tab-1",
    tab_title: "Main Task",
    provider_id: "provider-1",
    provider_name: "Primary",
    provider_type: "openai_responses",
    model: "gpt-5.2",
    trigger_type: "auto",
    started_at: 1_760_000_000 - 30,
    ended_at: 1_760_000_000 - 29,
    duration_ms: 500,
    result: "success",
    error_summary: null,
    ...overrides,
  };
}

function buildPayload(overrides: Partial<StatsPayload> = {}): StatsPayload {
  return {
    requested_at: 1_760_000_000,
    range: "24h",
    tabs: [buildTab()],
    nodes: [buildNode()],
    requests: [buildRequest()],
    compacts: [buildCompact()],
    ...overrides,
  };
}

const defaultFilters: StatsFilters = {
  providerId: null,
  model: null,
  tabId: null,
  agentId: null,
};

describe("stats", () => {
  it("builds overview metrics from filtered request data", () => {
    const payload = buildPayload({
      requests: [
        buildRequest(),
        buildRequest({
          id: "req-2",
          result: "error",
          retry_count: 1,
          normalized_usage: null,
          raw_usage: null,
        }),
      ],
    });

    const filtered = filterStatsRecords(payload, defaultFilters);
    const overview = buildOverview(payload, defaultFilters, filtered);

    expect(overview.activeTabs).toBe(1);
    expect(overview.runningAgents).toBe(1);
    expect(overview.llmRequests).toBe(2);
    expect(overview.totalTokens).toBe(100);
    expect(overview.errorRate).toBe(0.5);
    expect(overview.avgLatencyMs).toBe(900);
    expect(overview.cacheRead).toBe(16);
    expect(overview.cacheWrite).toBe(4);
    expect(overview.cacheHitRate).toBe(0.2);
    expect(overview.hasCacheUsage).toBe(true);
  });

  it("groups provider requests by provider and model", () => {
    const groups = buildProviderGroups([
      buildRequest(),
      buildRequest({
        id: "req-2",
        model: "gpt-5-mini",
        duration_ms: 600,
      }),
      buildRequest({
        id: "req-3",
        provider_id: "provider-2",
        provider_name: "Secondary",
        model: "claude",
        duration_ms: 400,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.providerLabel).toBe("Primary");
    expect(groups[0]?.requestCount).toBe(2);
    expect(groups[0]?.models.map((model) => model.model)).toEqual([
      "gpt-5.2",
      "gpt-5-mini",
    ]);
    expect(groups[1]?.providerLabel).toBe("Secondary");
    expect(groups[1]?.models[0]?.model).toBe("claude");
  });

  it("builds recent events for errors, retries, and compacts in descending order", () => {
    const events = buildRecentEvents(
      [
        buildRequest({
          id: "req-1",
          ended_at: 1_760_000_000 - 40,
          result: "error",
          error_summary: "LLM API error",
          normalized_usage: null,
          raw_usage: null,
        }),
        buildRequest({
          id: "req-2",
          ended_at: 1_760_000_000 - 10,
          retry_count: 2,
        }),
      ],
      [buildCompact({ id: "cmp-1", ended_at: 1_760_000_000 - 20 })],
    );

    expect(events.map((event) => event.key)).toEqual([
      "req-2",
      "cmp-1",
      "req-1",
    ]);
    expect(events.map((event) => event.kind)).toEqual([
      "request_retry",
      "compact",
      "request_error",
    ]);
  });

  it("allocates requests and compacts into chart buckets", () => {
    const buckets = buildChartBuckets(
      "24h",
      [
        buildRequest({
          ended_at: 1_760_000_000 - 60,
          duration_ms: 1200,
        }),
      ],
      [buildCompact({ ended_at: 1_760_000_000 - 60 })],
      1_760_000_000,
    );

    expect(buckets.some((bucket) => bucket.requestCount === 1)).toBe(true);
    expect(buckets.some((bucket) => bucket.compactCount === 1)).toBe(true);
    expect(buckets.some((bucket) => bucket.avgLatencyMs === 1200)).toBe(true);
    expect(buckets.some((bucket) => bucket.cacheHitRate === 0.2)).toBe(true);
  });
});
