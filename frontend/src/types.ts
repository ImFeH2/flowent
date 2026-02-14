export type Role = "steward" | "supervisor" | "worker";

export type AgentState = "initializing" | "running" | "idle" | "error" | "terminated";

export type DisplayEventType =
  | "agent_created"
  | "agent_state_changed"
  | "agent_message"
  | "agent_terminated"
  | "tool_called"
  | "path_access_requested";

export type UpdateEventType =
  | DisplayEventType
  | "history_entry_added"
  | "history_entry_delta"
  | "path_access_requested";

export type EventType = UpdateEventType;

export interface Agent {
  id: string;
  role: Role;
  state: AgentState;
  branch: string | null;
  children: string[];
  name: string | null;
  status_description: string;
}

export interface AgentEvent {
  type: EventType;
  agent_id: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  from: "human" | "steward";
  content: string;
  timestamp: number;
}

export type HistoryEntryType =
  | "system"
  | "system_injection"
  | "received_message"
  | "assistant_text"
  | "assistant_thinking"
  | "tool_call"
  | "tool_result"
  | "sent_message"
  | "error";

export interface HistoryEntry {
  type: HistoryEntryType;
  content: string | null;
  from_id: string | null;
  to_id: string | null;
  tool_name: string | null;
  tool_call_id: string | null;
  arguments: Record<string, unknown> | null;
  timestamp: number;
  streaming?: boolean;
}

export interface AgentDetail {
  id: string;
  role: Role;
  state: AgentState;
  branch: string | null;
  name: string | null;
  children: { id: string; role: Role; state: AgentState; name: string | null; status_description: string }[];
  task_prompt: string;
  supervisor_id: string | null;
  status_description: string;
  permissions: {
    allowed_paths: string[];
    blocked_paths: string[];
    writable_paths: string[];
    allowed_commands: string[];
    network_access: boolean;
  };
  memory: Record<string, string>;
  history: HistoryEntry[];
}

export interface PathAccessRequest {
  requestId: string;
  agentId: string;
  path: string;
  reason: string;
}
