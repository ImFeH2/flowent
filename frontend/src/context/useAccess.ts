import { useContext } from "react";
import { AccessContext } from "@/context/accessContext.shared";

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error("useAccess must be used within AccessProvider");
  }
  return context;
}
