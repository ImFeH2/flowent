import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShellHeaderProps {
  compact: boolean;
  onOpenNavigation: () => void;
}

export function ShellHeader({ compact, onOpenNavigation }: ShellHeaderProps) {
  if (!compact) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-border/70 py-3">
      <div className="flex items-center">
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
      </div>
    </div>
  );
}
