import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { McpPage } from "@/pages/McpPage";
import type {
  MCPActivityRecord,
  MCPServerConfig,
  MCPServerRecord,
  MCPStatePayload,
} from "@/types";

const {
  createMcpServerMock,
  deleteMcpServerMock,
  fetchMcpStateMock,
  loginMcpServerMock,
  logoutMcpServerMock,
  previewMcpPromptMock,
  refreshAllMcpServersMock,
  refreshMcpServerMock,
  toastErrorMock,
  toastSuccessMock,
  updateMcpServerMock,
} = vi.hoisted(() => ({
  createMcpServerMock: vi.fn(),
  deleteMcpServerMock: vi.fn(),
  fetchMcpStateMock: vi.fn(),
  loginMcpServerMock: vi.fn(),
  logoutMcpServerMock: vi.fn(),
  previewMcpPromptMock: vi.fn(),
  refreshAllMcpServersMock: vi.fn(),
  refreshMcpServerMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateMcpServerMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  createMcpServer: (...args: unknown[]) => createMcpServerMock(...args),
  deleteMcpServer: (...args: unknown[]) => deleteMcpServerMock(...args),
  fetchMcpState: (...args: unknown[]) => fetchMcpStateMock(...args),
  loginMcpServer: (...args: unknown[]) => loginMcpServerMock(...args),
  logoutMcpServer: (...args: unknown[]) => logoutMcpServerMock(...args),
  previewMcpPrompt: (...args: unknown[]) => previewMcpPromptMock(...args),
  refreshAllMcpServers: (...args: unknown[]) =>
    refreshAllMcpServersMock(...args),
  refreshMcpServer: (...args: unknown[]) => refreshMcpServerMock(...args),
  updateMcpServer: (...args: unknown[]) => updateMcpServerMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

function buildConfig(
  overrides: Partial<MCPServerConfig> & Pick<MCPServerConfig, "name">,
): MCPServerConfig {
  return {
    name: overrides.name,
    transport: overrides.transport ?? "stdio",
    enabled: overrides.enabled ?? true,
    required: overrides.required ?? false,
    startup_timeout_sec: overrides.startup_timeout_sec ?? 10,
    tool_timeout_sec: overrides.tool_timeout_sec ?? 30,
    enabled_tools: overrides.enabled_tools ?? [],
    disabled_tools: overrides.disabled_tools ?? [],
    scopes: overrides.scopes ?? [],
    oauth_resource: overrides.oauth_resource ?? "",
    launcher: overrides.launcher ?? "",
    command: overrides.command ?? "npx",
    args: overrides.args ?? ["-y", "demo-mcp"],
    env: overrides.env ?? {},
    env_vars: overrides.env_vars ?? ["MCP_TOKEN"],
    cwd: overrides.cwd ?? "/workspace/tools",
    url: overrides.url ?? "",
    bearer_token_env_var: overrides.bearer_token_env_var ?? "",
    http_headers: overrides.http_headers ?? {},
    env_http_headers: overrides.env_http_headers ?? [],
  };
}

function buildActivity(
  overrides: Partial<MCPActivityRecord> &
    Pick<MCPActivityRecord, "id" | "server_name" | "action" | "summary">,
): MCPActivityRecord {
  return {
    id: overrides.id,
    server_name: overrides.server_name,
    action: overrides.action,
    actor_node_id: overrides.actor_node_id ?? null,
    tab_id: overrides.tab_id ?? null,
    started_at: overrides.started_at ?? 1710000000,
    ended_at: overrides.ended_at ?? 1710000001,
    duration_ms: overrides.duration_ms ?? 1000,
    result: overrides.result ?? "success",
    summary: overrides.summary,
    tool_name: overrides.tool_name ?? null,
    fully_qualified_id: overrides.fully_qualified_id ?? null,
    target: overrides.target ?? null,
    approval_result: overrides.approval_result ?? null,
  };
}

function buildServer(
  overrides: Partial<MCPServerRecord> & {
    config: MCPServerConfig;
  },
): MCPServerRecord {
  return {
    config: overrides.config,
    snapshot: overrides.snapshot ?? {
      server_name: overrides.config.name,
      transport: overrides.config.transport,
      status: "connected",
      auth_status:
        overrides.config.transport === "stdio" ? "unsupported" : "connected",
      last_auth_result: null,
      last_refresh_at: 1710000000,
      last_refresh_result: "success",
      last_error: null,
      tools: [
        {
          source: "mcp",
          server_name: overrides.config.name,
          tool_name: "list_files",
          fully_qualified_id: `mcp__${overrides.config.name}__list_files`,
          title: "List Files",
          description: "Browse files",
          parameters: {},
          read_only_hint: true,
          destructive_hint: false,
          open_world_hint: false,
        },
      ],
      resources: [],
      resource_templates: [],
      prompts: [],
      capability_counts: {
        tools: 1,
        resources: 0,
        resource_templates: 0,
        prompts: 0,
      },
    },
    visibility: overrides.visibility ?? {
      scope: "global",
      active: true,
    },
    activity: overrides.activity ?? [],
  };
}

function buildState(servers: MCPServerRecord[]): MCPStatePayload {
  return { servers };
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <McpPage />
    </SWRConfig>,
  );
}

describe("McpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the external MCP summary and removes the old Autopoe server card", async () => {
    fetchMcpStateMock.mockResolvedValue(
      buildState([
        buildServer({ config: buildConfig({ name: "filesystem" }) }),
        buildServer({
          config: buildConfig({
            name: "github",
            transport: "streamable_http",
            bearer_token_env_var: "GITHUB_TOKEN",
            url: "https://mcp.github.example",
          }),
          snapshot: {
            server_name: "github",
            transport: "streamable_http",
            status: "auth_required",
            auth_status: "not_logged_in",
            last_auth_result: "logged_out",
            last_refresh_at: 1710000000,
            last_refresh_result: "error",
            last_error:
              "Authentication is required before refreshing this server",
            tools: [],
            resources: [],
            resource_templates: [],
            prompts: [],
            capability_counts: {
              tools: 0,
              resources: 0,
              resource_templates: 0,
              prompts: 0,
            },
          },
        }),
      ]),
    );

    renderPage();

    expect(await screen.findByText("Configured")).toBeInTheDocument();
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Auth Required").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Error").length).toBeGreaterThan(0);
    expect(screen.queryByText("Autopoe MCP Server")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("npx @playwright/mcp@latest"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search MCP servers"),
    ).toBeInTheDocument();
  });

  it("filters the server list in-page and can clear back to the full list", async () => {
    fetchMcpStateMock.mockResolvedValue(
      buildState([
        buildServer({ config: buildConfig({ name: "filesystem" }) }),
        buildServer({ config: buildConfig({ name: "github" }) }),
      ]),
    );

    renderPage();

    expect((await screen.findAllByText("filesystem")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("github")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search MCP servers"), {
      target: { value: "missing" },
    });

    expect(
      await screen.findByText("No matching MCP servers"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));

    await waitFor(() =>
      expect(screen.getAllByText("filesystem").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("github")).toBeInTheDocument();
  });

  it("parses a Quick Add launcher and submits the derived server config", async () => {
    fetchMcpStateMock.mockResolvedValue(
      buildState([
        buildServer({
          config: buildConfig({ name: "filesystem" }),
        }),
      ]),
    );
    let resolveCreate: (value: Record<string, unknown>) => void = () => {};
    createMcpServerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve as (value: Record<string, unknown>) => void;
        }),
    );

    renderPage();

    await screen.findByText("Configured");
    fireEvent.change(
      screen.getByPlaceholderText("npx @playwright/mcp@latest"),
      {
        target: { value: "npx @playwright/mcp@latest" },
      },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Quick Add" })[1]);

    await waitFor(() =>
      expect(screen.getAllByText("playwright-mcp").length).toBeGreaterThan(1),
    );

    await waitFor(() =>
      expect(createMcpServerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "playwright-mcp",
          transport: "stdio",
          launcher: "npx @playwright/mcp@latest",
          command: "npx",
          args: ["@playwright/mcp@latest"],
        }),
      ),
    );

    resolveCreate({
      server_name: "playwright-mcp",
      transport: "stdio",
      status: "connected",
      auth_status: "unsupported",
      last_auth_result: null,
      last_refresh_at: 1710000000,
      last_refresh_result: "success",
      last_error: null,
      tools: [],
      resources: [],
      resource_templates: [],
      prompts: [],
      capability_counts: {
        tools: 0,
        resources: 0,
        resource_templates: 0,
        prompts: 0,
      },
    });

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("MCP server added"),
    );
  });

  it("shows global availability, launcher mapping, and filters activity categories", async () => {
    fetchMcpStateMock.mockResolvedValue(
      buildState([
        buildServer({
          config: buildConfig({
            name: "filesystem",
            launcher: "npx @modelcontextprotocol/server-filesystem /workspace",
            args: ["/workspace"],
          }),
          activity: [
            buildActivity({
              id: "activity-refresh",
              server_name: "filesystem",
              action: "refresh",
              summary: "Capabilities refreshed",
            }),
            buildActivity({
              id: "activity-auth-check",
              server_name: "filesystem",
              action: "refresh",
              result: "error",
              summary:
                "Authentication is required before refreshing this server",
            }),
            buildActivity({
              id: "activity-tool",
              server_name: "filesystem",
              action: "tool_call",
              summary: "Tool call completed",
              tool_name: "list_files",
            }),
          ],
        }),
      ]),
    );

    renderPage();

    expect((await screen.findAllByText("Global")).length).toBeGreaterThan(0);
    expect(screen.getByText("Original Launcher")).toBeInTheDocument();
    expect(screen.getByText("Parsed Result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Tool" }));

    expect(await screen.findByText("Tool call completed")).toBeInTheDocument();
    expect(
      screen.queryByText("Capabilities refreshed"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Auth" }));

    expect(
      await screen.findByText(
        "Authentication is required before refreshing this server",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tool call completed")).not.toBeInTheDocument();
  });
});
