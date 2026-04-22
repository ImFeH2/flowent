import { describe, expect, it } from "vitest";
import { resolveStatsFilters, hasVisibleStatsData } from "@/pages/stats/lib";
import type { StatsFilterOptions, StatsFilters } from "@/lib/stats";
import type { StatsPayload } from "@/types";

const filterOptions: StatsFilterOptions = {
  providers: [
    { value: "provider-1", label: "Primary" },
    { value: "provider-2", label: "Secondary" },
  ],
  models: [{ value: "gpt-5.2", label: "gpt-5.2" }],
  tabs: [{ value: "tab-1", label: "Main Task" }],
  agents: [{ value: "leader-1", label: "Leader" }],
};

const filters: StatsFilters = {
  providerId: "provider-1",
  model: "missing-model",
  tabId: "tab-1",
  agentId: "missing-agent",
};

function buildVisibleInput(
  overrides: Partial<
    Pick<StatsPayload, "requests" | "compacts" | "nodes">
  > = {},
): Pick<StatsPayload, "requests" | "compacts" | "nodes"> {
  return {
    requests: [],
    compacts: [],
    nodes: [],
    ...overrides,
  };
}

describe("stats page lib", () => {
  it("drops filters that are no longer available in the current payload", () => {
    expect(resolveStatsFilters(filters, filterOptions)).toEqual({
      providerId: "provider-1",
      model: null,
      tabId: "tab-1",
      agentId: null,
    });
  });

  it("treats current runtime activity as visible stats even without records", () => {
    expect(
      hasVisibleStatsData(
        buildVisibleInput({
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
              provider_id: null,
              provider_name: null,
              provider_type: null,
              model: null,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false when there are no records and no live activity", () => {
    expect(
      hasVisibleStatsData(
        buildVisibleInput({
          nodes: [
            {
              id: "leader-1",
              label: "Leader",
              name: "Leader",
              role_name: "Conductor",
              node_type: "agent",
              is_leader: true,
              state: "idle",
              tab_id: "tab-1",
              tab_title: "Main Task",
              provider_id: null,
              provider_name: null,
              provider_type: null,
              model: null,
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});
