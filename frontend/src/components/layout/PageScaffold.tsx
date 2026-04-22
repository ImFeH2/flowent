import { Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PageScaffoldProps {
  children: ReactNode;
  className?: string;
}

interface SoftPanelProps {
  children: ReactNode;
  className?: string;
}

interface PageTitleBarProps {
  actions?: ReactNode;
  className?: string;
  hint?: string;
  title: string;
}

export function PageScaffold({ children, className }: PageScaffoldProps) {
  return (
    <div
      className={cn("flex h-full flex-col min-h-0 overflow-hidden", className)}
    >
      {children}
    </div>
  );
}

export function SoftPanel({ children, className }: SoftPanelProps) {
  return (
    <section
      className={cn(
        "rounded-xl bg-card/[0.18] p-5 ring-1 ring-white/[0.04]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PageTitleBar({
  actions,
  className,
  hint,
  title,
}: PageTitleBarProps) {
  return (
    <div className={cn("border-b border-border/70 pb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-[28px] font-medium tracking-[-0.04em] text-foreground">
            {title}
          </h1>
          {hint ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-card/20 text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-label={`${title} details`}
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs px-3 py-2">
                  {hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function SettingsRow({
  label,
  children,
  valueClassName,
}: {
  label: string;
  description?: string; // Kept in interface so usages don't break
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="min-w-0 flex-1 md:max-w-[200px]">
        <label className="text-[13px] font-medium text-foreground/80">
          {label}
        </label>
      </div>
      <div className={cn("w-full min-w-0 flex-1", valueClassName)}>
        {children}
      </div>
    </div>
  );
}
