import type { Edge, Node, SnapGrid, XYPosition } from "@xyflow/react";

export type WorkflowNodeKind = "trigger" | "agent";
export type CanvasMode = "blueprint" | "workflow";
export type TriggerMode = "manual" | "schedule" | "webhook";
export type RunStatus = "idle" | "pending" | "running" | "success" | "error";
export type BlueprintLastRunStatus =
  | "not-run"
  | "running"
  | "success"
  | "error";
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";
export type ConnectionType =
  | "openai"
  | "openai-responses"
  | "anthropic"
  | "gemini";
export type RuntimeConversationRole =
  | "system"
  | "user"
  | "tool-calls"
  | "assistant";

export type RuntimeConversationEntry = {
  id: string;
  role: RuntimeConversationRole;
  content: string;
};

export type TriggerRunDetails = {
  kind: "trigger";
  inputPayload: string;
  outputPayload: string;
};

export type AgentRunDetails = {
  kind: "agent";
  inputPayload: string;
  outputPayload: string;
  modelPresetName?: string;
  modelName?: string;
  conversation: RuntimeConversationEntry[];
};

export type NodeRunDetails = TriggerRunDetails | AgentRunDetails;

export type WorkflowNodeData = {
  kind: WorkflowNodeKind;
  title: string;
  name?: string;
  avatar?: string;
  triggerMode?: TriggerMode;
  initialPayload?: string;
  cronExpression?: string;
  webhookUrl?: string;
  modelPresetId?: string;
  systemPrompt?: string;
  tools?: string[];
  status: RunStatus;
  errorMessage?: string;
  runDetails?: NodeRunDetails;
  [key: string]: unknown;
};

export type FlowNode = Node<WorkflowNodeData, "workflow">;
export type FlowEdge = Edge;

export type WorkflowRun = {
  id: string;
  startedAt: string;
  updatedAt: string;
  status: WorkflowRunStatus;
  summary: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type BlueprintAsset = {
  id: string;
  name: string;
  updatedAt: string;
  lastRunStatus: BlueprintLastRunStatus;
  summary: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  runHistory: WorkflowRun[];
  selectedRunId: string | null;
};

export const canvasSnapGrid: SnapGrid = [20, 20];

function snapCanvasCoordinate(value: number, interval: number) {
  return Math.round(value / interval) * interval;
}

export function snapCanvasPosition(position: XYPosition): XYPosition {
  return {
    x: snapCanvasCoordinate(position.x, canvasSnapGrid[0]),
    y: snapCanvasCoordinate(position.y, canvasSnapGrid[1]),
  };
}

export type ModelConnection = {
  id: string;
  type: ConnectionType;
  name: string;
  accessKey: string;
  endpointUrl: string;
};

export type ModelPreset = {
  id: string;
  name: string;
  modelConnectionId: string;
  modelName: string;
  temperature: number;
  outputLimit: number;
  topP?: number;
  frequencyPenalty?: number;
  testStatus?: "idle" | "success" | "error";
  testMessage?: string;
};

export type Role = {
  id: string;
  name: string;
  avatar: string;
  systemPrompt: string;
  modelPresetId: string;
};

export const connectionTypeLabels: Record<ConnectionType, string> = {
  openai: "OpenAI",
  "openai-responses": "OpenAI Responses",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

export const connectionTypeParameterSupport: Record<
  ConnectionType,
  {
    temperature: boolean;
    outputLimit: boolean;
    topP: boolean;
    frequencyPenalty: boolean;
  }
> = {
  openai: {
    temperature: true,
    outputLimit: true,
    topP: true,
    frequencyPenalty: true,
  },
  "openai-responses": {
    temperature: true,
    outputLimit: true,
    topP: true,
    frequencyPenalty: true,
  },
  anthropic: {
    temperature: true,
    outputLimit: true,
    topP: true,
    frequencyPenalty: false,
  },
  gemini: {
    temperature: true,
    outputLimit: true,
    topP: true,
    frequencyPenalty: true,
  },
};

export const workflowRunStatusLabels: Record<WorkflowRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
};

export const runStatusLabels: Record<RunStatus, string> = {
  idle: "Idle",
  pending: "Pending",
  running: "Thinking",
  success: "Success",
  error: "Error",
};

export const availableTools = [
  { id: "web-search", label: "Web Search" },
  { id: "code-execution", label: "Code Execution" },
];

export const initialModelConnections: ModelConnection[] = [
  {
    id: "connection-work-gateway",
    type: "openai",
    name: "Work gateway",
    accessKey: "saved-demo-key",
    endpointUrl: "https://api.openai.com/v1",
  },
  {
    id: "connection-local-service",
    type: "openai-responses",
    name: "Local model service",
    accessKey: "saved-demo-key",
    endpointUrl: "http://localhost:4000/v1",
  },
];

export const initialModelPresets: ModelPreset[] = [
  {
    id: "preset-writing",
    name: "Writing Model",
    modelConnectionId: "connection-work-gateway",
    modelName: "gpt-4o",
    temperature: 0.7,
    outputLimit: 1200,
    testStatus: "idle",
  },
  {
    id: "preset-review",
    name: "Review Model",
    modelConnectionId: "connection-local-service",
    modelName: "gpt-4.1",
    temperature: 0.2,
    outputLimit: 1800,
    testStatus: "idle",
  },
];

export const initialRoles: Role[] = [
  {
    id: "role-product-copywriter",
    name: "Product Copywriter",
    avatar: "PC",
    systemPrompt:
      "You are a product copywriter. Turn the input into concise, specific launch copy with a clear next action.",
    modelPresetId: "preset-writing",
  },
  {
    id: "role-code-reviewer",
    name: "Code Reviewer",
    avatar: "CR",
    systemPrompt:
      "You are a code reviewer. Inspect the input for correctness, regressions, maintainability risks, and missing tests.",
    modelPresetId: "preset-review",
  },
  {
    id: "role-research-analyst",
    name: "Research Analyst",
    avatar: "RA",
    systemPrompt:
      "You are a research analyst. Extract the key facts, compare tradeoffs, and produce a short decision-ready summary.",
    modelPresetId: "preset-review",
  },
];

export const initialNodes: FlowNode[] = [
  {
    id: "trigger-1",
    type: "workflow",
    position: { x: 0, y: 120 },
    data: {
      kind: "trigger",
      title: "Manual Trigger",
      triggerMode: "manual",
      initialPayload: "Draft a concise campaign outline for the launch.",
      cronExpression: "0 9 * * 1",
      webhookUrl: "https://flowent.local/webhooks/manual-trigger",
      status: "idle",
    },
  },
  {
    id: "agent-1",
    type: "workflow",
    position: { x: 340, y: 40 },
    data: {
      kind: "agent",
      title: "Copywriter",
      name: "Copywriter",
      avatar: "CW",
      modelPresetId: "preset-writing",
      systemPrompt:
        "You are a product copywriter. Use {{payload}} to create concise, specific launch copy.",
      tools: ["web-search"],
      status: "idle",
    },
  },
  {
    id: "agent-2",
    type: "workflow",
    position: { x: 680, y: 160 },
    data: {
      kind: "agent",
      title: "Reviewer",
      name: "Reviewer",
      avatar: "RV",
      modelPresetId: "preset-review",
      systemPrompt:
        "Review the upstream result in {{input}} for clarity, accuracy, and next actions.",
      tools: ["code-execution"],
      status: "idle",
      errorMessage: "The selected service returned an empty response.",
    },
  },
];

export const initialEdges: FlowEdge[] = [
  {
    id: "trigger-1-agent-1",
    source: "trigger-1",
    target: "agent-1",
    sourceHandle: "output",
    targetHandle: "input",
    type: "smoothstep",
  },
  {
    id: "agent-1-agent-2",
    source: "agent-1",
    target: "agent-2",
    sourceHandle: "output",
    targetHandle: "input",
    type: "smoothstep",
  },
];

export const initialBlueprints: BlueprintAsset[] = [
  {
    id: "blueprint-launch-campaign",
    name: "Launch Campaign",
    updatedAt: "2026-04-27T09:00:00.000Z",
    lastRunStatus: "not-run",
    summary: "Draft launch copy, review it, and prepare the next step.",
    nodes: initialNodes,
    edges: initialEdges,
    runHistory: [],
    selectedRunId: null,
  },
];

export function createNode(
  kind: WorkflowNodeKind,
  id: string,
  position: FlowNode["position"],
): FlowNode {
  const snappedPosition = snapCanvasPosition(position);

  if (kind === "trigger") {
    return {
      id,
      type: "workflow",
      position: snappedPosition,
      data: {
        kind,
        title: "Manual Trigger",
        triggerMode: "manual",
        initialPayload: "",
        cronExpression: "0 9 * * 1",
        webhookUrl: `https://flowent.local/webhooks/${id}`,
        status: "idle",
      },
    };
  }

  return {
    id,
    type: "workflow",
    position: snappedPosition,
    data: {
      kind,
      title: "Agent",
      name: "Agent",
      avatar: "AI",
      modelPresetId: "preset-writing",
      systemPrompt: "Use {{payload}} to complete the assigned step.",
      tools: [],
      status: "idle",
    },
  };
}
