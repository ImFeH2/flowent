import { requestJson } from "./shared";

export interface AppMeta {
  provider_types?: string[];
  version?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  source?: "builtin" | "mcp";
  parameters?: Record<string, unknown>;
  server_name?: string;
  tool_name?: string;
  fully_qualified_id?: string;
  read_only_hint?: boolean;
  destructive_hint?: boolean;
  open_world_hint?: boolean;
}

export async function fetchAppMeta(): Promise<AppMeta> {
  return requestJson<AppMeta>("/api/meta", {
    errorMessage: "Failed to fetch app metadata",
  });
}

export async function fetchTools(): Promise<ToolInfo[]> {
  return requestJson<{ tools?: ToolInfo[] }, ToolInfo[]>("/api/tools", {
    errorMessage: "Failed to fetch tools",
    fallback: [],
    map: (data) => data?.tools ?? [],
  });
}
