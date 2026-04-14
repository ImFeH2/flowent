import { getImageAssetUrl } from "@/lib/api";
import { useImageViewer } from "@/context/imageViewer";
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
  const { openImage } = useImageViewer();
  const src = getImageAssetUrl(assetId);
  const aspectRatio =
    typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
      ? `${width} / ${height}`
      : undefined;
  const meta = `${mimeType || "image asset"}${
    width && height ? ` · ${width}x${height}` : ""
  }`;

  return (
    <>
      <button
        type="button"
        onClick={() =>
          openImage({
            src,
            alt,
            meta,
          })
        }
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
          <div className="text-[11px] text-white/52">{meta}</div>
        </div>
      </button>
    </>
  );
}
