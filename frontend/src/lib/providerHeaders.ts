function isHeaderObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatProviderHeaders(
  headers: Record<string, string> | undefined,
): string {
  if (!headers || Object.keys(headers).length === 0) {
    return "";
  }
  return JSON.stringify(headers, null, 2);
}

export function parseProviderHeadersInput(value: string): {
  headers: Record<string, string>;
  error: string | null;
} {
  if (!value.trim()) {
    return { headers: {}, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { headers: {}, error: "Headers must be valid JSON" };
  }

  if (!isHeaderObject(parsed)) {
    return { headers: {}, error: "Headers must be a JSON object" };
  }

  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(parsed)) {
    if (typeof headerValue !== "string") {
      return {
        headers: {},
        error: "Headers values must all be strings",
      };
    }
    headers[key] = headerValue;
  }

  return { headers, error: null };
}
