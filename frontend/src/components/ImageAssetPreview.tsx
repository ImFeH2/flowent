import { useState } from "react";
import { X } from "lucide-react";
import { getImageAssetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ImageAssetPreviewProps {
  assetId: string;
  alt?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  compact?: boolean;
}

export function ImageAssetPreview({
  assetId,
  alt,
  mimeType,
  width,
  height,
  compact = false,
}: ImageAssetPreviewProps) {
  const [open, setOpen] = useState(false);
  const src = getImageAssetUrl(assetId);
  const aspectRatio =
    typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
      ? `${width} / ${height}`
      : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group block w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] text-left transition-colors hover:border-white/[0.16]",
          compact ? "max-w-[240px]" : "max-w-[360px]",
        )}
      >
        <div
          style={aspectRatio ? { aspectRatio } : undefined}
          className={cn(
            "relative overflow-hidden bg-black/30",
            compact ? "min-h-[132px]" : "min-h-[180px]",
          )}
        >
          <img
            alt={alt || "Image"}
            className="h-full w-full object-cover"
            loading="lazy"
            src={src}
          />
        </div>
        <div className="space-y-1 px-3 py-2.5">
          <div className="text-[12px] font-medium text-white/88">
            {alt || "Image"}
          </div>
          <div className="text-[11px] text-white/52">
            {mimeType || "image asset"}
            {width && height ? ` · ${width}x${height}` : ""}
          </div>
        </div>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/86 p-4 backdrop-blur-md">
          <button
            aria-label="Close image preview"
            className="absolute right-4 top-4 z-20 flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/78 transition-colors hover:bg-white/16 hover:text-white"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
          <button
            aria-label="Close image preview"
            className="absolute inset-0 z-0"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="relative z-10 max-h-[88vh] max-w-[88vw] overflow-hidden rounded-2xl border border-white/10 bg-black/55 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]">
            <img
              alt={alt || "Image"}
              className="max-h-[78vh] max-w-[88vw] object-contain"
              src={src}
            />
            <div className="space-y-1 border-t border-white/8 px-4 py-3 text-left">
              <div className="text-sm font-medium text-white/92">
                {alt || "Image"}
              </div>
              <div className="text-xs text-white/55">
                {mimeType || "image asset"}
                {width && height ? ` · ${width}x${height}` : ""}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
