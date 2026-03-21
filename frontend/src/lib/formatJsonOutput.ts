export function formatJsonOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return null;
    }

    try {
      return JSON.stringify(JSON.parse(trimmed), null, 4);
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 4);
    } catch {
      return String(value);
    }
  }

  return null;
}
