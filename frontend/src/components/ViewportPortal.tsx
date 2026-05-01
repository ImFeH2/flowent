import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ViewportPortalProps {
  children: ReactNode;
}

export function ViewportPortal({ children }: ViewportPortalProps) {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(children, document.body);
}
