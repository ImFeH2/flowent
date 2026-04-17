import type { AssistantInputHistoryEntry } from "@/types";

const STORAGE_KEY = "autopoe.assistantInputHistory";
const MAX_ENTRIES = 50;

type PersistedAssistantInputHistoryEntry = Pick<
  AssistantInputHistoryEntry,
  "text" | "timestamp"
>;
type Listener = () => void;

let initialized = false;
let sessionEntries: AssistantInputHistoryEntry[] = [];
const listeners = new Set<Listener>();

function hasPersistableText(text: string) {
  return text.trim().length > 0;
}

function normalizePersistedEntry(
  value: unknown,
): AssistantInputHistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const text =
    typeof (value as { text?: unknown }).text === "string"
      ? (value as { text: string }).text
      : null;
  const timestamp =
    typeof (value as { timestamp?: unknown }).timestamp === "number"
      ? (value as { timestamp: number }).timestamp
      : null;

  if (text === null || timestamp === null) {
    return null;
  }

  if (!hasPersistableText(text)) {
    return null;
  }

  return {
    text,
    images: [],
    timestamp,
  };
}

function loadPersistedEntries(): AssistantInputHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizePersistedEntry(entry))
      .filter((entry): entry is AssistantInputHistoryEntry => entry !== null)
      .slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function persistEntries(entries: AssistantInputHistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const persisted: PersistedAssistantInputHistoryEntry[] = entries
      .filter(({ text }) => hasPersistableText(text))
      .map(({ text, timestamp }) => ({
        text,
        timestamp,
      }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    return;
  }
}

function ensureInitialized() {
  if (initialized) {
    return;
  }

  sessionEntries = loadPersistedEntries();
  initialized = true;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function getAssistantInputHistorySnapshot(): AssistantInputHistoryEntry[] {
  ensureInitialized();
  return sessionEntries;
}

export function subscribeAssistantInputHistory(listener: Listener) {
  ensureInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function appendAssistantInputHistoryEntry(
  entry: AssistantInputHistoryEntry,
) {
  ensureInitialized();
  sessionEntries = [...sessionEntries, entry].slice(-MAX_ENTRIES);
  persistEntries(sessionEntries);
  emitChange();
}

export function resetAssistantInputHistorySessionForTests() {
  initialized = false;
  sessionEntries = [];
}

export function clearAssistantInputHistoryForTests() {
  resetAssistantInputHistorySessionForTests();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
