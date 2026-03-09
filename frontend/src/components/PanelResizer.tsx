import { cn } from "@/lib/utils";
import React from "react";

interface PanelResizerProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  position: "left" | "right";
  className?: string;
}

export function PanelResizer({
  onMouseDown,
  isDragging,
  position,
  className,
}: PanelResizerProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "absolute top-0 bottom-0 z-50 w-2 cursor-col-resize flex items-center justify-center -mx-1 group",
        position === "left" ? "left-0" : "right-0",
        className,
      )}
    >
      <div
        className={cn(
          "w-[2px] h-full transition-colors delay-100",
          isDragging
            ? "bg-primary/50"
            : "bg-transparent group-hover:bg-primary/30",
        )}
      />
    </div>
  );
}
