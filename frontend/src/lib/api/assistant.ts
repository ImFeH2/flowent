import { requestJson } from "./shared";

export interface AssistantMessageResponse {
  status: "sent" | "command_executed";
  command_name?: string;
}

export async function sendAssistantMessageRequest(
  content: string,
): Promise<AssistantMessageResponse> {
  return requestJson<AssistantMessageResponse, AssistantMessageResponse>(
    "/api/assistant/message",
    {
      method: "POST",
      body: { content },
      errorMessage: "Failed to send Assistant message",
    },
  );
}
