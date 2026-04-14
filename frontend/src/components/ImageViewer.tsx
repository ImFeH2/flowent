import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  ImageViewerContext,
  type ImageViewerPayload,
} from "@/context/imageViewer";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
const ZOOM_EPSILON = 0.0001;
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
const IMAGE_MAX_WIDTH_RATIO = 0.88;
const IMAGE_MAX_HEIGHT_RATIO = 0.78;

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
}

function clampZoom(value: number) {
  if (value <= MIN_ZOOM + ZOOM_EPSILON) {
    return MIN_ZOOM;
  }
  if (value >= MAX_ZOOM - ZOOM_EPSILON) {
    return MAX_ZOOM;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(6))));
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getPayloadSize(payload: ImageViewerPayload | null): Size | null {
  if (!payload) {
    return null;
  }
  if (!isPositiveNumber(payload.width) || !isPositiveNumber(payload.height)) {
    return null;
  }
  return { width: payload.width, height: payload.height };
}

function getViewportPoint(
  viewportElement: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): Point | null {
  if (!viewportElement) {
    return null;
  }
  const rect = viewportElement.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function toLocalImagePoint(
  anchor: Point,
  view: ViewState,
  baseSize: Size,
  viewportSize: Size,
): Point {
  return {
    x:
      (anchor.x - viewportSize.width / 2 - view.panX) / view.zoom +
      baseSize.width / 2,
    y:
      (anchor.y - viewportSize.height / 2 - view.panY) / view.zoom +
      baseSize.height / 2,
  };
}

function panForLocalImagePoint(
  localPoint: Point,
  anchor: Point,
  zoom: number,
  baseSize: Size,
  viewportSize: Size,
): Point {
  return {
    x:
      anchor.x -
      viewportSize.width / 2 -
      (localPoint.x - baseSize.width / 2) * zoom,
    y:
      anchor.y -
      viewportSize.height / 2 -
      (localPoint.y - baseSize.height / 2) * zoom,
  };
}

export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<ImageViewerPayload | null>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [view, setView] = useState<ViewState>({
    panX: 0,
    panY: 0,
    zoom: 1,
  });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragMovedRef = useRef(false);
  const dragStateRef = useRef<{
    originPanX: number;
    originPanY: number;
    startPoint: Point;
  } | null>(null);

  const resetView = useCallback(() => {
    setView({ panX: 0, panY: 0, zoom: 1 });
    setDragging(false);
    dragMovedRef.current = false;
    dragStateRef.current = null;
  }, []);

  const closeImage = useCallback(() => {
    resetView();
    setPayload(null);
    setImageSize(null);
  }, [resetView]);

  const openImage = useCallback(
    (nextPayload: ImageViewerPayload) => {
      resetView();
      setImageSize(getPayloadSize(nextPayload));
      setPayload(nextPayload);
    },
    [resetView],
  );

  useEffect(() => {
    if (!payload) {
      return;
    }

    if (getPayloadSize(payload)) {
      return;
    }

    let active = true;
    const image = new Image();

    const handleLoad = () => {
      if (!active) {
        return;
      }
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      }
    };

    image.addEventListener("load", handleLoad);
    image.src = payload.src;
    if (image.complete) {
      handleLoad();
    }

    return () => {
      active = false;
      image.removeEventListener("load", handleLoad);
    };
  }, [payload]);

  useLayoutEffect(() => {
    if (!payload || !viewportRef.current) {
      return;
    }

    const element = viewportRef.current;
    const syncViewportSize = () => {
      const rect = element.getBoundingClientRect();
      setViewportSize({
        width: element.clientWidth || rect.width || window.innerWidth,
        height: element.clientHeight || rect.height || window.innerHeight,
      });
    };

    syncViewportSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncViewportSize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [payload]);

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
      const pointer = getViewportPoint(
        viewportRef.current,
        event.clientX,
        event.clientY,
      );
      if (!pointer) {
        return;
      }

      if (
        pointer.x !== dragState.startPoint.x ||
        pointer.y !== dragState.startPoint.y
      ) {
        dragMovedRef.current = true;
      }

      setView((current) => ({
        ...current,
        panX: dragState.originPanX + pointer.x - dragState.startPoint.x,
        panY: dragState.originPanY + pointer.y - dragState.startPoint.y,
      }));
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

  const baseImageSize = useMemo(() => {
    if (
      !imageSize ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0 ||
      imageSize.width <= 0 ||
      imageSize.height <= 0
    ) {
      return null;
    }

    const fitScale = Math.min(
      (viewportSize.width * IMAGE_MAX_WIDTH_RATIO) / imageSize.width,
      (viewportSize.height * IMAGE_MAX_HEIGHT_RATIO) / imageSize.height,
      1,
    );

    return {
      width: imageSize.width * fitScale,
      height: imageSize.height * fitScale,
    };
  }, [imageSize, viewportSize]);

  const zoomByFactor = useCallback(
    (factor: number, anchor?: Point) => {
      setView((current) => {
        const nextZoom = clampZoom(current.zoom * factor);
        if (
          !anchor ||
          !baseImageSize ||
          viewportSize.width <= 0 ||
          viewportSize.height <= 0 ||
          Math.abs(nextZoom - current.zoom) <= ZOOM_EPSILON
        ) {
          return nextZoom === current.zoom
            ? current
            : { ...current, zoom: nextZoom };
        }

        const localPoint = toLocalImagePoint(
          anchor,
          current,
          baseImageSize,
          viewportSize,
        );
        const nextPan = panForLocalImagePoint(
          localPoint,
          anchor,
          nextZoom,
          baseImageSize,
          viewportSize,
        );

        return {
          panX: nextPan.x,
          panY: nextPan.y,
          zoom: nextZoom,
        };
      });
    },
    [baseImageSize, viewportSize],
  );

  const handleWheelZoom = useCallback(
    (event: WheelEvent) => {
      const anchor = getViewportPoint(
        viewportRef.current,
        event.clientX,
        event.clientY,
      );
      if (!anchor) {
        return;
      }

      event.preventDefault();
      zoomByFactor(Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY), anchor);
    },
    [zoomByFactor],
  );

  useEffect(() => {
    if (!payload || !viewportRef.current) {
      return;
    }

    const element = viewportRef.current;
    const handleWheel = (event: WheelEvent) => {
      handleWheelZoom(event);
    };

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheelZoom, payload]);

  const handleViewportMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('[data-pan-exempt="true"]')) {
        return;
      }

      const startPoint = getViewportPoint(
        viewportRef.current,
        event.clientX,
        event.clientY,
      );
      if (!startPoint) {
        return;
      }

      event.preventDefault();
      dragMovedRef.current = false;
      dragStateRef.current = {
        originPanX: view.panX,
        originPanY: view.panY,
        startPoint,
      };
      setDragging(true);
    },
    [view.panX, view.panY],
  );

  const handleViewportClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('[data-pan-exempt="true"]')) {
        return;
      }
      const imageElement = imageRef.current;
      if (imageElement) {
        const imageRect = imageElement.getBoundingClientRect();
        if (
          event.clientX >= imageRect.left &&
          event.clientX <= imageRect.right &&
          event.clientY >= imageRect.top &&
          event.clientY <= imageRect.bottom
        ) {
          return;
        }
      }
      closeImage();
    },
    [closeImage],
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
                ref={viewportRef}
                className="absolute inset-0 flex items-center justify-center p-4 sm:p-6"
                data-testid="global-image-viewer-backdrop"
                onClick={handleViewportClick}
                onMouseDown={handleViewportMouseDown}
              >
                <div
                  className="absolute right-4 top-4 z-20"
                  data-pan-exempt="true"
                >
                  <ViewerControlButton
                    ariaLabel="Close image preview"
                    onClick={closeImage}
                  >
                    <X className="size-4" />
                  </ViewerControlButton>
                </div>
                <div
                  className="absolute bottom-4 left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 px-2"
                  data-pan-exempt="true"
                >
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
                {baseImageSize ? (
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    data-testid="global-image-viewer-viewport"
                  >
                    <div
                      className={cn(
                        "relative transform-gpu will-change-transform",
                        dragging
                          ? "transition-none"
                          : "transition-transform duration-120 ease-out",
                      )}
                      data-testid="global-image-viewer-stage"
                      style={{
                        height: `${baseImageSize.height}px`,
                        transform: `translate3d(${view.panX}px, ${view.panY}px, 0px) scale(${view.zoom})`,
                        transformOrigin: "center center",
                        width: `${baseImageSize.width}px`,
                      }}
                    >
                      <img
                        alt={payload.alt || "Image"}
                        className={cn(
                          "block h-full w-full select-none object-contain shadow-[0_28px_80px_-32px_rgba(0,0,0,0.9)]",
                          dragging ? "cursor-grabbing" : "cursor-grab",
                        )}
                        data-testid="global-image-viewer-image"
                        draggable={false}
                        ref={imageRef}
                        src={payload.src}
                      />
                    </div>
                  </div>
                ) : (
                  <img
                    alt={payload.alt || "Image"}
                    className="max-h-[78vh] max-w-[88vw] select-none object-contain shadow-[0_28px_80px_-32px_rgba(0,0,0,0.9)]"
                    data-testid="global-image-viewer-image"
                    draggable={false}
                    src={payload.src}
                  />
                )}
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
      data-pan-exempt="true"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
