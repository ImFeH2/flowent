import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageScaffoldProps {
  title: string;
  description: string;
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
        <div>
          <h1 className="text-[1.45rem] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
        "rounded-lg border border-white/6 bg-surface-2/80 p-4 backdrop-blur-xl md:p-5",
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
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
        {eyebrow}
      </p>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
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
  description: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-8 border-b border-white/[0.04] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <label className="text-sm font-medium">{label}</label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={cn("w-64 shrink-0", valueClassName)}>{children}</div>
    </div>
  );
}
