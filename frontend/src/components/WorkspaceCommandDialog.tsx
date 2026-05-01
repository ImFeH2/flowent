import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface WorkspaceCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}

export function WorkspaceCommandDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: WorkspaceCommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("flex max-h-[calc(100svh-2rem)] flex-col p-0", className)}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-foreground/[0.04] to-transparent opacity-50" />
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close dialog"
              className="absolute right-4 top-4 z-20 size-7 rounded-md bg-accent/45 text-muted-foreground hover:bg-accent/65 hover:text-accent-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </DialogClose>

          <DialogHeader className="relative z-10 shrink-0 pr-8">
            <DialogTitle className="text-[1.1rem] font-medium text-foreground">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>

          <div
            className="relative z-10 mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 scrollbar-none"
            data-testid="workspace-command-dialog-body"
          >
            {children}
          </div>

          <DialogFooter className="relative z-10 mt-6 shrink-0 border-t border-border pt-4">
            {footer}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceDialogField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground/80">{label}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

export function WorkspaceDialogMeta({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-accent/35 px-3.5 py-2.5 text-xs text-muted-foreground">
      {children}
    </div>
  );
}
