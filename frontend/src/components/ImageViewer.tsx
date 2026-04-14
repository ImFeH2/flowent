import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Minus, RotateCcw, Plus, X } from "lucide-react";
import {
  ImageViewerContext,
  type ImageViewerPayload,
} from "@/context/imageViewer";
import { cn } from "@/lib/utils";
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<ImageViewerPayload | null>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const resetView = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragStateRef.current = null;
  }, []);

  const closeImage = useCallback(() => {
    resetView();
    setPayload(null);
  }, [resetView]);

  const openImage = useCallback(
    (nextPayload: ImageViewerPayload) => {
      resetView();
      setPayload(nextPayload);
    },
    [resetView],
  );

  const adjustScale = useCallback((delta: number) => {
    setScale((current) => {
      const next = clampScale(current + delta);
      if (next === MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!payload) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeImage, payload]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      setOffset({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      });
    };

    const handleMouseUp = () => {
      setDragging(false);
      dragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const value = useMemo(() => ({ openImage }), [openImage]);

  return (
    <ImageViewerContext.Provider value={value}>
      {children}
      {payload && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-modal="true"
              className="fixed inset-0 z-[120] bg-black/92 backdrop-blur-md"
              role="dialog"
            >
              <button
                aria-label="Close image preview"
                className="absolute inset-0"
                data-testid="global-image-viewer-backdrop"
                onClick={closeImage}
                type="button"
              />
              <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                <div
                  className="relative flex h-full w-full items-center justify-center overflow-hidden"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="absolute right-0 top-0 z-20 flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/45 p-1 shadow-[0_22px_48px_-26px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                      <ViewerControlButton
                        ariaLabel="Zoom Out"
                        disabled={scale <= MIN_SCALE}
                        label="Zoom Out"
                        onClick={() => adjustScale(-SCALE_STEP)}
                      >
                        <Minus className="size-3.5" />
                      </ViewerControlButton>
                      <ViewerControlButton
                        ariaLabel="Zoom In"
                        disabled={scale >= MAX_SCALE}
                        label="Zoom In"
                        onClick={() => adjustScale(SCALE_STEP)}
                      >
                        <Plus className="size-3.5" />
                      </ViewerControlButton>
                      <ViewerControlButton
                        ariaLabel="Reset"
                        disabled={
                          scale === MIN_SCALE &&
                          offset.x === 0 &&
                          offset.y === 0
                        }
                        label="Reset"
                        onClick={resetView}
                      >
                        <RotateCcw className="size-3.5" />
                      </ViewerControlButton>
                    </div>
                    <ViewerControlButton
                      ariaLabel="Close image preview"
                      onClick={closeImage}
                    >
                      <X className="size-4" />
                    </ViewerControlButton>
                  </div>
                  <div className="absolute bottom-0 left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 px-2">
                    <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-center shadow-[0_28px_72px_-34px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                      <div className="text-sm font-medium text-white/92">
                        {payload.alt || "Image"}
                      </div>
                      {payload.meta ? (
                        <div className="mt-1 text-xs text-white/55">
                          {payload.meta}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "relative flex h-full w-full items-center justify-center",
                      scale > MIN_SCALE
                        ? dragging
                          ? "cursor-grabbing"
                          : "cursor-grab"
                        : "cursor-default",
                    )}
                    data-testid="global-image-viewer-stage"
                    onMouseDown={(event) => {
                      if (event.button !== 0 || scale <= MIN_SCALE) {
                        return;
                      }
                      event.preventDefault();
                      dragStateRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: offset.x,
                        originY: offset.y,
                      };
                      setDragging(true);
                    }}
                    onWheel={(event) => {
                      event.preventDefault();
                      adjustScale(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
                    }}
                    style={{
                      transform: `translate3d(${offset.x}px, ${offset.y}px, 0px)`,
                    }}
                  >
                    <img
                      alt={payload.alt || "Image"}
                      className="max-h-[78vh] max-w-[88vw] select-none object-contain shadow-[0_28px_80px_-32px_rgba(0,0,0,0.9)]"
                      data-testid="global-image-viewer-image"
                      draggable={false}
                      src={payload.src}
                      style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "center center",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ImageViewerContext.Provider>
  );
}

function ViewerControlButton({
  ariaLabel,
  children,
  disabled = false,
  label,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 text-[11px] font-medium tracking-[0.02em] text-white/82 transition-colors hover:bg-white/14 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
