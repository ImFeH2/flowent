import type { ContentPart } from "@/types";
import { requestJson } from "./shared";

export interface AssistantMessageResponse {
  status: "sent" | "command_executed";
  command_name?: string;
  message_id?: string;
}

export interface AssistantRetryResponse {
  status: "retried";
  message_id: string;
}

export async function sendAssistantMessageRequest(input: {
  content?: string;
  parts?: ContentPart[];
}): Promise<AssistantMessageResponse> {
  return requestJson<AssistantMessageResponse, AssistantMessageResponse>(
    "/api/assistant/message",
    {
      method: "POST",
      body: input,
      errorMessage: "Failed to send Assistant message",
    },
  );
}

export async function retryAssistantMessageRequest(
  messageId: string,
): Promise<AssistantRetryResponse> {
  return requestJson<AssistantRetryResponse, AssistantRetryResponse>(
    `/api/assistant/messages/${messageId}/retry`,
    {
      method: "POST",
      errorMessage: "Failed to retry Assistant message",
    },
  );
}
