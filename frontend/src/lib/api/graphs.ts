import type { Graph } from "@/types";
import { requestJson } from "./shared";

export async function fetchGraphs(): Promise<Graph[]> {
  return requestJson<{ graphs?: Graph[] }, Graph[]>("/api/graphs", {
    errorMessage: "Failed to fetch graphs",
    fallback: [],
    map: (data) => data?.graphs ?? [],
  });
}
