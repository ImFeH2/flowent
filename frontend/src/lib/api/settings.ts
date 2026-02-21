export async function fetchSettings<T>(): Promise<T> {
  const res = await fetch("/api/settings");
  return res.json() as Promise<T>;
}

export async function saveSettings(settings: unknown): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}
