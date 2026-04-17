import { createContext } from "react";
import type { AccessState } from "@/types";

export interface AccessContextValue {
  loading: boolean;
  state: AccessState;
  login: (code: string) => Promise<AccessState>;
  logout: () => Promise<AccessState>;
  refresh: () => Promise<AccessState>;
  requireReauth: () => void;
}

export const AccessContext = createContext<AccessContextValue | null>(null);
