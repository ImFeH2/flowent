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
    <div className="mb-2.5 px-1">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  valueClassName,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-4 last:border-b-0 md:flex-row md:items-start md:justify-between md:gap-4 transition-colors hover:bg-muted/30">
      <div className="min-w-0 shrink-0 md:w-[35%] pt-0.5">
        <label className="block text-[13px] font-medium text-foreground">
          {label}
        </label>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/80">
            {description}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "w-full min-w-0 flex-1 md:w-[65%] flex md:justify-end",
          valueClassName,
        )}
      >
        <div className="w-full md:max-w-md space-y-3">{children}</div>
      </div>
    </div>
  );
}
