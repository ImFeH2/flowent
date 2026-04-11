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
  | "ErrorEntry";

export interface HistoryEntry {
  type: HistoryEntryType;
  content?: string | null;
  state?: AgentState | null;
  reason?: string | null;
  from_id?: string | null;
  to_ids?: string[] | null;
  message_id?: string | null;
  tool_name?: string | null;
  tool_call_id?: string | null;
  arguments?: Record<string, unknown> | null;
  result?: string | null;
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
  tools: string[];
  write_dirs: string[];
  allow_network: boolean;
  position?: {
    x: number;
    y: number;
  } | null;
  history: HistoryEntry[];
}

export interface TaskTab {
  id: string;
  title: string;
  goal: string;
  leader_id?: string | null;
  created_at: number;
  updated_at: number;
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

export type StreamingDelta =
  | { type: "ContentDelta"; text: string }
  | { type: "ThinkingDelta"; text: string }
  | { type: "ToolResultDelta"; tool_call_id: string; text: string }
  | {
      type: "SentMessageDelta";
      message_id: string;
      to_ids: string[];
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
