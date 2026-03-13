import { requestVoid } from "./shared";

export async function sendAssistantMessageRequest(
  content: string,
): Promise<void> {
  await requestVoid("/api/assistant/message", {
    method: "POST",
    body: { content },
    errorMessage: "Failed to send Assistant message",
  });
}
