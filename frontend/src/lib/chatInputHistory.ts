import type { AssistantInputHistoryEntry } from "@/types";

const STORAGE_PREFIX = "flowent.chatInputHistory";
const MAX_ENTRIES = 50;

type PersistedChatInputHistoryEntry = Pick<
  AssistantInputHistoryEntry,
  "text" | "timestamp"
>;
type Listener = () => void;

const initializedScopes = new Set<string>();
const sessionEntriesByScope = new Map<string, AssistantInputHistoryEntry[]>();
const listenersByScope = new Map<string, Set<Listener>>();

function getStorageKey(scope: string) {
  return `${STORAGE_PREFIX}.${scope}`;
}

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

  if (text === null || timestamp === null || !hasPersistableText(text)) {
    return null;
  }

  return {
    text,
    images: [],
    timestamp,
  };
}

function loadPersistedEntries(scope: string): AssistantInputHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(scope));
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

function persistEntries(scope: string, entries: AssistantInputHistoryEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const persisted: PersistedChatInputHistoryEntry[] = entries
      .filter(({ text }) => hasPersistableText(text))
      .map(({ text, timestamp }) => ({
        text,
        timestamp,
      }));
    window.localStorage.setItem(
      getStorageKey(scope),
      JSON.stringify(persisted),
    );
  } catch {
    return;
  }
}

function ensureInitialized(scope: string) {
  if (initializedScopes.has(scope)) {
    return;
  }

  sessionEntriesByScope.set(scope, loadPersistedEntries(scope));
  initializedScopes.add(scope);
}

function emitChange(scope: string) {
  const listeners = listenersByScope.get(scope);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

export function getChatInputHistorySnapshot(scope: string) {
  ensureInitialized(scope);
  return sessionEntriesByScope.get(scope) ?? [];
}

export function subscribeChatInputHistory(scope: string, listener: Listener) {
  ensureInitialized(scope);
  const listeners = listenersByScope.get(scope) ?? new Set<Listener>();
  listeners.add(listener);
  listenersByScope.set(scope, listeners);
  return () => {
    const current = listenersByScope.get(scope);
    current?.delete(listener);
    if (current && current.size === 0) {
      listenersByScope.delete(scope);
    }
  };
}

export function appendChatInputHistoryEntry(
  scope: string,
  entry: AssistantInputHistoryEntry,
) {
  ensureInitialized(scope);
  const nextEntries = [
    ...(sessionEntriesByScope.get(scope) ?? []),
    entry,
  ].slice(-MAX_ENTRIES);
  sessionEntriesByScope.set(scope, nextEntries);
  persistEntries(scope, nextEntries);
  emitChange(scope);
}

export function resetChatInputHistorySessionForTests() {
  initializedScopes.clear();
  sessionEntriesByScope.clear();
  listenersByScope.clear();
}

export function clearChatInputHistoryForTests(scope?: string) {
  if (scope) {
    initializedScopes.delete(scope);
    sessionEntriesByScope.delete(scope);
    listenersByScope.delete(scope);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(getStorageKey(scope));
    }
    return;
  }

  const scopes = Array.from(initializedScopes);
  resetChatInputHistorySessionForTests();
  if (typeof window === "undefined") {
    return;
  }
  for (const scopeKey of scopes) {
    window.localStorage.removeItem(getStorageKey(scopeKey));
  }
}
