"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  applyThemeMode,
  defaultThemeMode,
  getInitialThemeMode,
  persistThemeMode,
  themeStorageKey,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const themeModeChangeEvent = "flowent-theme-change";

function subscribeThemeMode(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === themeStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(themeModeChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(themeModeChangeEvent, onStoreChange);
  };
}

function notifyThemeModeChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(themeModeChangeEvent));
  }
}

export function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const themeMode = useSyncExternalStore(
    subscribeThemeMode,
    getInitialThemeMode,
    () => defaultThemeMode,
  );

  useEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode]);

  const nextThemeMode = themeMode === "dark" ? "light" : "dark";
  const label = themeMode === "dark" ? "Dark Mode" : "Light Mode";
  const Icon = themeMode === "dark" ? MoonIcon : SunIcon;

  const toggleThemeMode = useCallback(() => {
    persistThemeMode(nextThemeMode);
    applyThemeMode(nextThemeMode);
    notifyThemeModeChange();
  }, [nextThemeMode]);

  const button = (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "default"}
      className={cn(
        "w-full justify-start gap-3",
        collapsed && "justify-center px-0",
      )}
      aria-label={label}
      onClick={toggleThemeMode}
    >
      <Icon className="size-4" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Button>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
