import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  ImageViewerContext,
  type ImageViewerPayload,
} from "@/context/imageViewer";
import { cn } from "@/lib/utils";
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_EPSILON = 0.001;
const WHEEL_ZOOM_SENSITIVITY = 0.0018;

function clampScale(value: number) {
  if (value <= MIN_SCALE + SCALE_EPSILON) {
    return MIN_SCALE;
  }
  if (value >= MAX_SCALE - SCALE_EPSILON) {
    return MAX_SCALE;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(4))));
}

export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<ImageViewerPayload | null>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);
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
    dragMovedRef.current = false;
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

  const zoomToScale = useCallback(
    (nextScale: number, anchor?: { x: number; y: number }) => {
      setScale((currentScale) => {
        const clampedScale = clampScale(nextScale);

        setOffset((currentOffset) => {
          if (clampedScale === MIN_SCALE) {
            return { x: 0, y: 0 };
          }
          if (
            Math.abs(clampedScale - currentScale) <= SCALE_EPSILON ||
            !anchor ||
            !viewportRef.current
          ) {
            return currentOffset;
          }

          const rect = viewportRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const anchorLocalX =
            (anchor.x - centerX - currentOffset.x) / currentScale;
          const anchorLocalY =
            (anchor.y - centerY - currentOffset.y) / currentScale;

          return {
            x: Number(
              (anchor.x - centerX - anchorLocalX * clampedScale).toFixed(4),
            ),
            y: Number(
              (anchor.y - centerY - anchorLocalY * clampedScale).toFixed(4),
            ),
          };
        });

        return clampedScale;
      });
    },
    [],
  );

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

      if (
        event.clientX !== dragState.startX ||
        event.clientY !== dragState.startY
      ) {
        dragMovedRef.current = true;
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

  const handleDirectBackgroundClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      closeImage();
    },
    [closeImage],
  );

  const handleWheelZoom = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      zoomToScale(scale * zoomFactor, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [scale, zoomToScale],
  );

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
              <div
                className="absolute inset-0 flex items-center justify-center p-4 sm:p-6"
                data-testid="global-image-viewer-backdrop"
                onClick={handleDirectBackgroundClick}
                onWheelCapture={handleWheelZoom}
              >
                <div
                  ref={viewportRef}
                  className="relative flex h-full w-full items-center justify-center overflow-hidden"
                  data-testid="global-image-viewer-viewport"
                >
                  <div className="absolute right-0 top-0 z-20">
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
                    ref={stageRef}
                    className={cn(
                      "relative flex h-full w-full items-center justify-center will-change-transform",
                      dragging
                        ? "transition-none"
                        : "transition-transform duration-150 ease-out",
                      scale > MIN_SCALE
                        ? dragging
                          ? "cursor-grabbing"
                          : "cursor-grab"
                        : "cursor-default",
                    )}
                    data-testid="global-image-viewer-stage"
                    onClick={handleDirectBackgroundClick}
                    onMouseDown={(event) => {
                      if (event.button !== 0 || scale <= MIN_SCALE) {
                        return;
                      }
                      event.preventDefault();
                      dragMovedRef.current = false;
                      dragStateRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: offset.x,
                        originY: offset.y,
                      };
                      setDragging(true);
                    }}
                    style={{
                      transform: `translate3d(${offset.x}px, ${offset.y}px, 0px)`,
                    }}
                  >
                    <img
                      alt={payload.alt || "Image"}
                      className={cn(
                        "max-h-[78vh] max-w-[88vw] select-none object-contain shadow-[0_28px_80px_-32px_rgba(0,0,0,0.9)] will-change-transform",
                        dragging
                          ? "transition-none"
                          : "transition-transform duration-150 ease-out",
                      )}
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
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/82 shadow-[0_22px_48px_-26px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors hover:bg-white/14 hover:text-white"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
