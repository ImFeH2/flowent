import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageScaffoldProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

interface SoftPanelProps {
  children: ReactNode;
  className?: string;
}

export function PageScaffold({
  title,
  description,
  actions,
  children,
  className,
}: PageScaffoldProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col px-6 py-5 md:px-8 md:py-6",
        className,
      )}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-white/6 pb-4">
        <div className="min-w-0">
          <h1 className="text-[1.38rem] font-semibold tracking-[-0.025em] text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-[42rem] text-sm leading-6 text-muted-foreground/78">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function SoftPanel({ children, className }: SoftPanelProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-white/6 bg-surface-2/80 p-3.5 backdrop-blur-xl md:p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      {eyebrow ? (
        <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground/76">
          {description}
        </p>
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
    <div className="grid gap-2 border-b border-white/[0.04] py-3 last:border-0 md:grid-cols-[minmax(0,1fr)_16rem] md:items-start md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex min-h-9 flex-wrap items-center gap-2">
          <label className="text-sm font-medium">{label}</label>
          {description ? (
            <p className="text-[11px] text-muted-foreground/72">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "w-full min-w-0 md:w-64 md:justify-self-end",
          valueClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
