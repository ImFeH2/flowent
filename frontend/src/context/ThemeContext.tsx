import { useEffect, type ReactNode } from "react";

const STORAGE_KEY = "flowent-theme";

function applyDarkTheme() {
  document.documentElement.style.colorScheme = "dark";
  document.documentElement.classList.add("dark");
  document.documentElement.classList.remove("light");
  localStorage.removeItem(STORAGE_KEY);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyDarkTheme();
  }, []);

  return children;
}
