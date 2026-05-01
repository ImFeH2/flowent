import { requestJson, requestVoid } from "./shared";
import type { MCPServerConfig, MCPStatePayload, MCPSnapshot } from "@/types";

export async function fetchMcpState(): Promise<MCPStatePayload> {
  return requestJson<MCPStatePayload>("/api/mcp", {
    method: "GET",
    errorMessage: "Failed to fetch MCP state",
  });
}

export async function refreshAllMcpServers(): Promise<MCPSnapshot[]> {
  return requestJson<{ servers?: MCPSnapshot[] }, MCPSnapshot[]>(
    "/api/mcp/refresh",
    {
      method: "POST",
      errorMessage: "Failed to refresh MCP servers",
      fallback: [],
      map: (data) => data?.servers ?? [],
    },
  );
}

export async function createMcpServer(
  payload: MCPServerConfig,
): Promise<MCPSnapshot> {
  return requestJson<{ snapshot: MCPSnapshot }, MCPSnapshot>(
    "/api/mcp/servers",
    {
      method: "POST",
      body: payload,
      errorMessage: "Failed to create MCP server",
      map: (data) => {
        if (!data) {
          throw new Error("Failed to create MCP server");
        }
        return data.snapshot;
      },
    },
  );
}

export async function updateMcpServer(
  serverName: string,
  payload: MCPServerConfig,
): Promise<MCPSnapshot> {
  return requestJson<{ snapshot: MCPSnapshot }, MCPSnapshot>(
    `/api/mcp/servers/${serverName}`,
    {
      method: "PATCH",
      body: payload,
      errorMessage: "Failed to update MCP server",
      map: (data) => {
        if (!data) {
          throw new Error("Failed to update MCP server");
        }
        return data.snapshot;
      },
    },
  );
}

export async function deleteMcpServer(serverName: string): Promise<void> {
  await requestVoid(`/api/mcp/servers/${serverName}`, {
    method: "DELETE",
    errorMessage: "Failed to delete MCP server",
  });
}

export async function refreshMcpServer(
  serverName: string,
): Promise<MCPSnapshot> {
  return requestJson<{ snapshot: MCPSnapshot }, MCPSnapshot>(
    `/api/mcp/servers/${serverName}/refresh`,
    {
      method: "POST",
      errorMessage: "Failed to refresh MCP server",
      map: (data) => {
        if (!data) {
          throw new Error("Failed to refresh MCP server");
        }
        return data.snapshot;
      },
    },
  );
}

export async function loginMcpServer(serverName: string): Promise<MCPSnapshot> {
  return requestJson<{ snapshot: MCPSnapshot }, MCPSnapshot>(
    `/api/mcp/servers/${serverName}/login`,
    {
      method: "POST",
      errorMessage: "Failed to login MCP server",
      map: (data) => {
        if (!data) {
          throw new Error("Failed to login MCP server");
        }
        return data.snapshot;
      },
    },
  );
}

export async function logoutMcpServer(serverName: string): Promise<void> {
  await requestVoid(`/api/mcp/servers/${serverName}/logout`, {
    method: "POST",
    errorMessage: "Failed to logout MCP server",
  });
}

export async function previewMcpPrompt(
  serverName: string,
  name: string,
  argumentsPayload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return requestJson<
    { preview: Record<string, unknown> },
    Record<string, unknown>
  >(`/api/mcp/servers/${serverName}/prompt-preview`, {
    method: "POST",
    body: { name, arguments: argumentsPayload },
    errorMessage: "Failed to preview MCP prompt",
    map: (data) => {
      if (!data) {
        throw new Error("Failed to preview MCP prompt");
      }
      return data.preview;
    },
  });
}
