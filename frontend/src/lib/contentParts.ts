import type { ContentPart } from "@/types";

export function normalizeContentParts(
  parts?: ContentPart[] | null,
  fallbackContent?: string | null,
): ContentPart[] {
  if (parts && parts.length > 0) {
    return parts;
  }
  if (!fallbackContent) {
    return [];
  }
  return [{ type: "text", text: fallbackContent }];
}

export function contentPartsToText(
  parts?: ContentPart[] | null,
  fallbackContent?: string | null,
): string {
  const normalized = normalizeContentParts(parts, fallbackContent);
  return normalized
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return part.alt ? `[image: ${part.alt}]` : "[image]";
    })
    .join("");
}
