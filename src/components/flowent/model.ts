import type { Edge, Node } from "@xyflow/react";

export type WorkflowNodeKind = "trigger" | "agent";
export type TriggerMode = "manual" | "schedule" | "webhook";
export type RunStatus = "idle" | "pending" | "running" | "success" | "error";
export type ProviderType = "openai" | "anthropic" | "custom";

export type WorkflowNodeData = {
  kind: WorkflowNodeKind;
  title: string;
  triggerMode?: TriggerMode;
  initialPayload?: string;
  cronExpression?: string;
  webhookUrl?: string;
  modelPresetId?: string;
  systemPrompt?: string;
  tools?: string[];
  status: RunStatus;
  errorMessage?: string;
  [key: string]: unknown;
};

export type FlowNode = Node<WorkflowNodeData, "workflow">;
export type FlowEdge = Edge;

export type Provider = {
  id: string;
  type: ProviderType;
  name: string;
  apiKey: string;
  baseUrl: string;
};

export type ModelPreset = {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  testStatus?: "idle" | "success" | "error";
  testMessage?: string;
};

export const providerTypeLabels: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  custom: "Custom (OpenAI Compatible)",
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

export const initialProviders: Provider[] = [
  {
    id: "provider-openai",
    type: "openai",
    name: "OpenAI Platform",
    apiKey: "saved-demo-key",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "provider-custom",
    type: "custom",
    name: "Local Gateway",
    apiKey: "saved-demo-key",
    baseUrl: "http://localhost:4000/v1",
  },
];

export const initialModelPresets: ModelPreset[] = [
  {
    id: "preset-writing",
    name: "Writing Model",
    providerId: "provider-openai",
    modelId: "gpt-4o",
    temperature: 0.7,
    maxTokens: 1200,
    testStatus: "idle",
  },
  {
    id: "preset-review",
    name: "Review Model",
    providerId: "provider-custom",
    modelId: "gpt-4.1",
    temperature: 0.2,
    maxTokens: 1800,
    testStatus: "idle",
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
    position: { x: 330, y: 40 },
    data: {
      kind: "agent",
      title: "Copywriter",
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
    position: { x: 670, y: 160 },
    data: {
      kind: "agent",
      title: "Reviewer",
      modelPresetId: "preset-review",
      systemPrompt:
        "Review the upstream result in {{input}} for clarity, accuracy, and next actions.",
      tools: ["code-execution"],
      status: "idle",
      errorMessage: "The provider returned an empty completion.",
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

export function createNode(
  kind: WorkflowNodeKind,
  id: string,
  position: FlowNode["position"],
): FlowNode {
  if (kind === "trigger") {
    return {
      id,
      type: "workflow",
      position,
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
    position,
    data: {
      kind,
      title: "Agent",
      modelPresetId: "preset-writing",
      systemPrompt: "Use {{payload}} to complete the assigned step.",
      tools: [],
      status: "idle",
    },
  };
}
