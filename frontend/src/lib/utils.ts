import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatZoomPercentage(zoom: number) {
  return `${Math.max(1, Math.round(zoom * 100))}%`;
}
