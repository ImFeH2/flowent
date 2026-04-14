import { createContext, useContext } from "react";

export interface ImageViewerPayload {
  src: string;
  alt?: string | null;
  meta?: string | null;
}

export interface ImageViewerContextValue {
  openImage: (payload: ImageViewerPayload) => void;
}

export const ImageViewerContext = createContext<ImageViewerContextValue | null>(
  null,
);

export function useImageViewer() {
  const context = useContext(ImageViewerContext);

  if (!context) {
    throw new Error("useImageViewer must be used within ImageViewerProvider");
  }

  return context;
}
