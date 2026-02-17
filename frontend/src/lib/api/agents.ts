import type { Agent, AgentDetail } from "@/types";

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch("/api/agents");
  const data = await res.json();
  return data.agents ?? [];
}

export async function fetchAgentDetail(
  agentId: string,
): Promise<AgentDetail | null> {
  const res = await fetch(`/api/agents/${agentId}`);
  const data = await res.json();
  if (data.error || !Array.isArray(data.history)) return null;
  return data as AgentDetail;
}

export async function sendAgentMessage(
  agentId: string,
  message: string,
): Promise<void> {
  await fetch(`/api/agents/${agentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export async function terminateAgent(agentId: string): Promise<void> {
  await fetch(`/api/agents/${agentId}/terminate`, { method: "POST" });
}

export interface MergeResult {
  status: string;
  message?: string;
  conflict_files?: string[];
}

export async function mergeToMain(agentId: string): Promise<MergeResult> {
  const res = await fetch(`/api/agents/${agentId}/merge-to-main`, {
    method: "POST",
  });
  if (res.status === 409) {
    const data = await res.json();
    return data.detail as MergeResult;
  }
  if (!res.ok) {
    throw new Error("Merge failed");
  }
  return res.json();
}
