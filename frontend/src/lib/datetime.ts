export type TimestampUnit = "auto" | "seconds" | "milliseconds";

interface FormatTimestampOptions {
  fallback?: string;
  format?: Intl.DateTimeFormatOptions;
  unit?: TimestampUnit;
}

export function normalizeTimestampMs(
  value?: number | null,
  unit: TimestampUnit = "auto",
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (unit === "milliseconds") {
    return value;
  }
  if (unit === "seconds") {
    return value * 1000;
  }
  return value > 1e12 ? value : value * 1000;
}

export function formatLocalTimestamp(
  value?: number | null,
  options: FormatTimestampOptions = {},
): string {
  const { fallback = "Unknown", format, unit = "auto" } = options;
  const normalized = normalizeTimestampMs(value, unit);

  if (normalized === null) {
    return fallback;
  }

  const date = new Date(normalized);
  if (format) {
    return new Intl.DateTimeFormat(undefined, format).format(date);
  }
  return date.toLocaleString();
}
