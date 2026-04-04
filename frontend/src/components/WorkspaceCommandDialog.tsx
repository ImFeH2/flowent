import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
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
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}

export function WorkspaceCommandDialog({
  open,
  onOpenChange,
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
  footer,
  className,
}: WorkspaceCommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("p-0", className)}>
        <div className="relative overflow-hidden px-6 pb-6 pt-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_58%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_48%)]" />
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close dialog"
              className="absolute right-4 top-4 z-20 flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <X className="size-4" />
            </button>
          </DialogClose>

          <DialogHeader className="relative z-10 gap-4 pr-10">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.055] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_14px_28px_-22px_rgba(255,255,255,0.16)]">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45">
                  {eyebrow}
                </p>
                <DialogTitle className="mt-1 text-white">{title}</DialogTitle>
              </div>
            </div>
            <DialogDescription className="max-w-[34rem] text-white/62">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="relative z-10 mt-6 space-y-4">{children}</div>

          <DialogFooter className="relative z-10 mt-6 border-t border-white/8 pt-4">
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
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/52">
          {label}
        </span>
        {hint ? (
          <span className="text-[11px] font-medium text-white/34">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

export function WorkspaceDialogMeta({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-3.5 py-3 text-sm text-white/68 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      {children}
    </div>
  );
}
