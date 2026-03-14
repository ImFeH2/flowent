export type NodeType = "assistant" | "agent";

export type AgentState =
  | "initializing"
  | "running"
  | "idle"
  | "error"
  | "terminated";

export type DisplayEventType =
  | "graph_created"
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
  graph_id: string | null;
  state: AgentState;
  connections: string[];
  name: string | null;
  todos: TodoItem[];
  role_name: string | null;
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

export type AssistantChatItem = HistoryEntry | PendingAssistantChatMessage;

export interface NodeDetail {
  id: string;
  node_type: NodeType;
  graph_id: string | null;
  state: AgentState;
  name: string | null;
  connections: string[];
  role_name: string | null;
  todos: TodoItem[];
  tools: string[];
  write_dirs: string[];
  allow_network: boolean;
  graph: Graph | null;
  history: HistoryEntry[];
}

export interface Graph {
  id: string;
  owner_agent_id: string;
  parent_graph_id: string | null;
  name: string | null;
  goal: string;
  entry_node_id: string | null;
}

export interface RoleModelConfig {
  provider_id: string;
  model: string;
}

export type StreamingDelta =
  | { type: "ContentDelta"; text: string }
  | { type: "ThinkingDelta"; text: string }
  | { type: "ToolResultDelta"; tool_call_id: string; text: string };

export interface Role {
  name: string;
  system_prompt: string;
  model: RoleModelConfig | null;
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
}
