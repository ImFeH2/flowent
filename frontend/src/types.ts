export type NodeType = "assistant" | "agent";

export type AgentState =
  | "initializing"
  | "idle"
  | "sleeping"
  | "running"
  | "error"
  | "terminated";

export type DisplayEventType =
  | "tab_created"
  | "tab_updated"
  | "tab_deleted"
  | "node_created"
  | "node_state_changed"
  | "node_todos_changed"
  | "node_message"
  | "node_terminated"
  | "node_connected"
  | "node_disconnected"
  | "assistant_content"
  | "tool_called";

export type UpdateEventType =
  | DisplayEventType
  | "history_cleared"
  | "history_entry_added"
  | "history_entry_delta";

export type EventType = UpdateEventType;

export interface TodoItem {
  text: string;
  type: string;
}

export interface Node {
  id: string;
  node_type: NodeType;
  tab_id?: string | null;
  is_leader: boolean;
  state: AgentState;
  connections: string[];
  name: string | null;
  todos: TodoItem[];
  role_name: string | null;
  capabilities?: ModelCapabilities | null;
  position?: {
    x: number;
    y: number;
  } | null;
}

export interface AgentEvent {
  type: EventType;
  agent_id: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface AssistantChatMessage {
  id: string;
  content: string;
  parts?: ContentPart[] | null;
  message_id?: string | null;
  timestamp: number;
  from: "human" | "assistant";
}

export interface PendingAssistantChatMessage extends AssistantChatMessage {
  type: "PendingHumanMessage";
}

export type HistoryEntryType =
  | "SystemEntry"
  | "ReceivedMessage"
  | "AssistantText"
  | "SentMessage"
  | "AssistantThinking"
  | "StateEntry"
  | "ToolCall"
  | "ErrorEntry"
  | "CommandResultEntry";

export type ContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      asset_id: string;
      mime_type?: string | null;
      width?: number | null;
      height?: number | null;
      alt?: string | null;
    };

export interface HistoryEntry {
  type: HistoryEntryType;
  content?: string | null;
  parts?: ContentPart[] | null;
  state?: AgentState | null;
  reason?: string | null;
  from_id?: string | null;
  to_id?: string | null;
  to_ids?: string[] | null;
  message_id?: string | null;
  tool_name?: string | null;
  tool_call_id?: string | null;
  arguments?: Record<string, unknown> | null;
  result?: string | null;
  command_name?: string | null;
  include_in_context?: boolean;
  timestamp: number;
  streaming?: boolean;
}

export type AssistantChatItem = HistoryEntry | PendingAssistantChatMessage;

export interface NodeDetail {
  id: string;
  node_type: NodeType;
  tab_id?: string | null;
  is_leader: boolean;
  state: AgentState;
  name: string | null;
  contacts: string[];
  connections: string[];
  role_name: string | null;
  todos: TodoItem[];
  capabilities?: ModelCapabilities | null;
  tools: string[];
  write_dirs: string[];
  allow_network: boolean;
  position?: {
    x: number;
    y: number;
  } | null;
  history: HistoryEntry[];
}

export type RouteSourceState = "manual" | "blueprint-derived" | "drifted";

export interface RouteSource {
  state: RouteSourceState;
  blueprint_id: string | null;
  blueprint_name: string | null;
  blueprint_version: number | null;
  blueprint_available: boolean;
}

export interface BlueprintSlot {
  id: string;
  role_name: string;
  display_name: string | null;
}

export interface BlueprintEdge {
  from_slot_id: string;
  to_slot_id: string;
}

export interface BlueprintVersionSummary {
  version: number;
  updated_at: number;
}

export interface RouteBlueprint {
  id: string;
  name: string;
  description: string;
  version: number;
  slots: BlueprintSlot[];
  edges: BlueprintEdge[];
  created_at: number;
  updated_at: number;
  node_count: number;
  edge_count: number;
  version_history?: BlueprintVersionSummary[];
}

export interface TaskTab {
  id: string;
  title: string;
  goal: string;
  leader_id?: string | null;
  created_at: number;
  updated_at: number;
  route_source: RouteSource;
  node_count?: number;
  edge_count?: number;
}

export interface TabEdge {
  id: string;
  tab_id: string;
  from_node_id: string;
  to_node_id: string;
  created_at?: number;
}

export interface RoleModelConfig {
  provider_id: string;
  model: string;
}

export interface ModelParams {
  reasoning_effort: "none" | "low" | "medium" | "high" | "xhigh" | null;
  verbosity: "low" | "medium" | "high" | null;
  max_output_tokens: number | null;
  temperature: number | null;
  top_p: number | null;
}

export interface ModelCapabilities {
  input_image: boolean;
  output_image: boolean;
}

export type StreamingDelta =
  | { type: "ContentDelta"; text: string }
  | { type: "ThinkingDelta"; text: string }
  | { type: "ToolResultDelta"; tool_call_id: string; text: string }
  | {
      type: "SentMessageDelta";
      message_id: string;
      to_id: string;
      text: string;
    }
  | {
      type: "ReceivedMessageDelta";
      message_id: string;
      from_id: string;
      text: string;
    };

export interface Role {
  name: string;
  description: string;
  system_prompt: string;
  model: RoleModelConfig | null;
  model_params: ModelParams | null;
  included_tools: string[];
  excluded_tools: string[];
  is_builtin: boolean;
}

export interface Provider {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  headers: Record<string, string>;
  retry_429_delay_seconds: number;
}

export interface ModelOption {
  id: string;
  capabilities?: ModelCapabilities | null;
  context_window_tokens?: number | null;
}

export type RetryPolicy = "no_retry" | "limited" | "unlimited";

export interface TelegramPendingChat {
  chat_id: number;
  username: string | null;
  display_name: string;
  first_seen_at: number;
  last_seen_at: number;
}

export interface TelegramApprovedChat {
  chat_id: number;
  username: string | null;
  display_name: string;
  approved_at: number;
}

export interface TelegramSettings {
  bot_token: string;
  pending_chats: TelegramPendingChat[];
  approved_chats: TelegramApprovedChat[];
}

export type StatsRange = "1h" | "24h" | "7d" | "30d";

export interface StatsUsage {
  total_tokens: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cached_input_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  details?: Record<string, number>;
}

export interface StatsTabSnapshot {
  id: string;
  title: string;
  goal: string;
  leader_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface StatsNodeSnapshot {
  id: string;
  label: string;
  name?: string | null;
  role_name?: string | null;
  node_type: NodeType;
  is_leader: boolean;
  state: AgentState;
  tab_id?: string | null;
  tab_title?: string | null;
  provider_id?: string | null;
  provider_name?: string | null;
  provider_type?: string | null;
  model?: string | null;
}

export interface StatsRequestRecord {
  id: string;
  node_id: string;
  node_label: string;
  role_name?: string | null;
  tab_id?: string | null;
  tab_title?: string | null;
  provider_id?: string | null;
  provider_name?: string | null;
  provider_type?: string | null;
  model?: string | null;
  started_at: number;
  ended_at: number;
  duration_ms: number;
  retry_count: number;
  result: "success" | "error";
  error_summary?: string | null;
  normalized_usage?: StatsUsage | null;
  raw_usage?: Record<string, unknown> | null;
}

export interface StatsCompactRecord {
  id: string;
  node_id: string;
  node_label: string;
  role_name?: string | null;
  tab_id?: string | null;
  tab_title?: string | null;
  provider_id?: string | null;
  provider_name?: string | null;
  provider_type?: string | null;
  model?: string | null;
  trigger_type: "manual" | "auto";
  started_at: number;
  ended_at: number;
  duration_ms: number;
  result: "success" | "error";
  error_summary?: string | null;
}

export interface StatsPayload {
  requested_at: number;
  range: StatsRange;
  tabs: StatsTabSnapshot[];
  nodes: StatsNodeSnapshot[];
  requests: StatsRequestRecord[];
  compacts: StatsCompactRecord[];
}
