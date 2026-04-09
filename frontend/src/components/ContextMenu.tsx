import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ViewportPortal } from "@/components/ViewportPortal";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | "divider";

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({ left: x, top: y }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      const margin = 8;
      const rect = el.getBoundingClientRect();
      const maxLeft = window.innerWidth - margin - rect.width;
      const maxTop = window.innerHeight - margin - rect.height;
      const left = Math.max(margin, Math.min(x, maxLeft));
      const top = Math.max(margin, Math.min(y, maxTop));
      setPos((prev) =>
        prev.left === left && prev.top === top ? prev : { left, top },
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [x, y, items.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <ViewportPortal>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className="fixed z-[200] min-w-[160px] rounded-md border border-glass-border bg-surface-raised py-1 shadow-xl backdrop-blur-sm"
        style={{ left: pos.left, top: pos.top }}
      >
        {items.map((item, i) =>
          item === "divider" ? (
            <div key={i} className="my-1 border-t border-glass-border" />
          ) : (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }}
              className={`w-full px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger
                  ? "text-graph-status-error/90 hover:bg-graph-status-error/[0.12] hover:text-graph-status-error"
                  : "text-foreground hover:bg-surface-3"
              }`}
            >
              {item.label}
            </button>
          ),
        )}
      </motion.div>
    </ViewportPortal>
  );
}
