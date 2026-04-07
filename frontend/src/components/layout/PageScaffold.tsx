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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/6 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[1.32rem] font-semibold tracking-[-0.025em] text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="text-xs text-muted-foreground/72">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {eyebrow ? (
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/78">
            {eyebrow}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="max-w-[32rem] text-[11px] text-muted-foreground/72">
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
