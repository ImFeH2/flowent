import { requestVoid } from "./shared";

export async function sendStewardMessageRequest(
  content: string,
): Promise<void> {
  await requestVoid("/api/steward/message", {
    method: "POST",
    body: { content },
    errorMessage: "Failed to send Assistant message",
  });
}
