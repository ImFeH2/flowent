export type ThemeMode = "dark" | "light";

export const defaultThemeMode: ThemeMode = "dark";
export const themeStorageKey = "flowent-theme";

export function normalizeThemeMode(value: string | null): ThemeMode {
  return value === "light" ? "light" : defaultThemeMode;
}

export function applyThemeMode(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.classList.toggle("dark", themeMode === "dark");
  root.classList.toggle("light", themeMode === "light");
  root.style.colorScheme = themeMode;
}

export function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return defaultThemeMode;
  }

  try {
    return normalizeThemeMode(window.localStorage.getItem(themeStorageKey));
  } catch {
    return defaultThemeMode;
  }
}

export function persistThemeMode(themeMode: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(themeStorageKey, themeMode);
  } catch {}
}
