import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { StatsPage } from "@/pages/StatsPage";
import type { StatsPayload } from "@/types";

const { fetchStats } = vi.hoisted(() => ({
  fetchStats: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchStats,
}));

function buildStatsPayload(
  overrides: Partial<StatsPayload> = {},
): StatsPayload {
  return {
    requested_at: 1_760_000_000,
    range: "24h",
    tabs: [
      {
        id: "tab-1",
        title: "Main Task",
        leader_id: "leader-1",
        created_at: 1,
        updated_at: 2,
      },
    ],
    nodes: [
      {
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
      },
    ],
    requests: [],
    compacts: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <StatsPage />
    </SWRConfig>,
  );
}

describe("StatsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders overview facts and provider summaries", async () => {
    fetchStats.mockResolvedValue(
      buildStatsPayload({
        requests: [
          {
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
            raw_usage: {
              total_tokens: 100,
            },
          },
        ],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Stats" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Active Tabs")).toBeInTheDocument();
    expect(screen.getByText("Running Agents")).toBeInTheDocument();
    expect(screen.getByText("By Provider / Model")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("expands recent request details and shows raw usage", async () => {
    fetchStats.mockResolvedValue(
      buildStatsPayload({
        requests: [
          {
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
            retry_count: 1,
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
            raw_usage: {
              total_tokens: 100,
              input_tokens: 80,
            },
          },
          {
            id: "req-2",
            node_id: "leader-1",
            node_label: "Leader",
            role_name: "Conductor",
            tab_id: "tab-1",
            tab_title: "Main Task",
            provider_id: "provider-1",
            provider_name: "Primary",
            provider_type: "openai_responses",
            model: "gpt-5.2",
            started_at: 1_760_000_000 - 10,
            ended_at: 1_760_000_000 - 9,
            duration_ms: 1200,
            retry_count: 0,
            result: "error",
            error_summary: "LLM API error",
            normalized_usage: null,
            raw_usage: null,
          },
        ],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("button", { name: /Retried 1 time/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Request failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Retried 1 time/i }));

    expect(await screen.findByText("Raw Usage")).toBeInTheDocument();
    expect(screen.getAllByText(/"total_tokens": 100/).length).toBeGreaterThan(
      0,
    );
  });
});
