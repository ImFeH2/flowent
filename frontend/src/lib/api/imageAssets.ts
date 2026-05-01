import { requestJson } from "./shared";

export interface UploadedImageAsset {
  id: string;
  mime_type: string;
  width?: number | null;
  height?: number | null;
  original_name?: string | null;
  url: string;
}

export function getImageAssetUrl(assetId: string): string {
  return `/api/image-assets/${encodeURIComponent(assetId)}`;
}

export async function uploadImageAssetRequest(
  file: File,
): Promise<UploadedImageAsset> {
  const body = new FormData();
  body.append("file", file);
  return requestJson<UploadedImageAsset, UploadedImageAsset>(
    "/api/image-assets",
    {
      method: "POST",
      body,
      errorMessage: "Failed to upload image",
    },
  );
}
