import type { ContentPart } from "@/types";
import { requestJson } from "./shared";

export interface AssistantMessageResponse {
  status: "sent" | "command_executed";
  command_name?: string;
  message_id?: string;
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
