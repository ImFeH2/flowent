import type { Formation } from "@/types";
import { requestJson } from "./shared";

export async function fetchFormations(): Promise<Formation[]> {
  return requestJson<{ formations?: Formation[] }, Formation[]>(
    "/api/formations",
    {
      errorMessage: "Failed to fetch formations",
      fallback: [],
      map: (data) => data?.formations ?? [],
    },
  );
}
