import type { AccessState } from "@/types";
import { requestJson } from "./shared";

export async function fetchAccessState(): Promise<AccessState> {
  return requestJson<AccessState>("/api/access/state", {
    errorMessage: "Failed to fetch access state",
  });
}

export async function loginAccess(code: string): Promise<AccessState> {
  return requestJson<AccessState>("/api/access/login", {
    method: "POST",
    body: { code },
    errorMessage: "Failed to verify access code",
  });
}

export async function logoutAccess(): Promise<AccessState> {
  return requestJson<AccessState>("/api/access/logout", {
    method: "POST",
    errorMessage: "Failed to logout",
  });
}
