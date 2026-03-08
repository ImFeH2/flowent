export type NodeType = "steward" | "conductor" | "agent";

export type AgentState =
  | "initializing"
  | "running"
  | "idle"
  | "error"
  | "terminated";

export type DisplayEventType =
  | "node_created"
  | "node_state_changed"
  | "node_todos_changed"
  | "node_message"
  | "node_terminated"
  | "node_connected"
  | "steward_content"
  | "tool_called";

export type UpdateEventType =
  | DisplayEventType
  | "history_entry_added"
  | "history_entry_delta";

export type EventType = UpdateEventType;

export interface TodoItem {
  id: number;
  text: string;
  done: boolean;
  type: string;
}

export interface Node {
  id: string;
  node_type: NodeType;
  state: AgentState;
  connections: string[];
  name: string | null;
  todos: TodoItem[];
  role_id: string | null;
}

export interface AgentEvent {
  type: EventType;
  agent_id: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface StewardMessage {
  content: string;
  timestamp: number;
  from: "human" | "steward";
}

export type HistoryEntryType =
  | "SystemEntry"
  | "SystemInjection"
  | "ReceivedMessage"
  | "AssistantText"
  | "AssistantThinking"
  | "ToolCall"
  | "ErrorEntry";

export interface HistoryEntry {
  type: HistoryEntryType;
  content?: string | null;
  from_id?: string | null;
  tool_name?: string | null;
  tool_call_id?: string | null;
  arguments?: Record<string, unknown> | null;
  result?: string | null;
  timestamp: number;
  streaming?: boolean;
}

export interface NodeDetail {
  id: string;
  node_type: NodeType;
  state: AgentState;
  name: string | null;
  connections: string[];
  role_id: string | null;
  todos: TodoItem[];
  history: HistoryEntry[];
}

export type StreamingDelta =
  | { type: "ContentDelta"; text: string }
  | { type: "ThinkingDelta"; text: string }
  | { type: "ToolResultDelta"; tool_call_id: string; text: string };

export interface Role {
  id: string;
  name: string;
  system_prompt: string;
}

export interface Provider {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
}
