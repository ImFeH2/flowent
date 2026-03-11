import { useState, useCallback } from "react";

const widthCache: Record<string, number> = {};

export function hasCachedPanelWidth(id: string): boolean {
  return Object.hasOwn(widthCache, id);
}

export function usePanelWidth(
  id: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
) {
  const [width, setWidth] = useState(() => widthCache[id] ?? defaultWidth);

  const updateWidth = useCallback(
    (newWidth: number) => {
      const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(clamped);
      widthCache[id] = clamped;
    },
    [id, minWidth, maxWidth],
  );

  return [width, updateWidth] as const;
}

export function usePanelDrag(
  width: number,
  setWidth: (w: number) => void,
  direction: "left" | "right" = "right",
) {
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setWidth(startWidth + (direction === "right" ? delta : -delta));
      };

      const onMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
    },
    [width, setWidth, direction],
  );

  return { isDragging, startDrag };
}
