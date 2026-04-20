import { PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShellHeaderProps {
  commandShortcutLabel: string;
  compact: boolean;
  onOpenCommandPalette: () => void;
  onOpenNavigation: () => void;
}

export function ShellHeader({
  commandShortcutLabel,
  compact,
  onOpenCommandPalette,
  onOpenNavigation,
}: ShellHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border/70 py-3">
      <div className="flex items-center gap-3">
        {compact ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={onOpenNavigation}
            className="size-9 shrink-0 rounded-md border border-border/70 bg-card/20 text-muted-foreground hover:bg-accent/35 hover:text-foreground"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className={cn(
            "flex h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/20 px-3 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            compact && "h-10",
          )}
          aria-label="Open command palette"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-[13px] text-muted-foreground">
              Search pages and workflows
            </span>
          </span>
          <span className="shrink-0 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {commandShortcutLabel}
          </span>
        </button>
      </div>
    </div>
  );
}
