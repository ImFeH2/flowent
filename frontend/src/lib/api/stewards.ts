export interface Steward {
  id: string;
  name: string;
  repo_path: string;
  state?: string;
}

export async function createSteward(params: {
  repo_path: string;
  name?: string;
  branch?: string;
  commit?: string;
}): Promise<Steward> {
  const res = await fetch("/api/stewards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to create steward");
  }
  return res.json();
}

export async function listStewards(): Promise<Steward[]> {
  const res = await fetch("/api/stewards");
  const data = await res.json();
  return data.stewards ?? [];
}
