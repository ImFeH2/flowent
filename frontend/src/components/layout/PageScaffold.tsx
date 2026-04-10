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
    <div className={cn("flex h-full flex-col px-8 py-8", className)}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium tracking-tight text-white/90">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 text-[13px] text-white/40">{description}</p>
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
        "rounded-xl border border-white/[0.04] bg-white/[0.01] p-5",
        className,
      )}
    >
      {children}
    </section>
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
    <div className="mb-6">
      <h2 className="text-base font-medium text-white/90">{title}</h2>
      {description ? (
        <p className="mt-1 text-[13px] text-white/40">{description}</p>
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
    <div className="flex flex-col gap-2 py-4 first:pt-0 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="min-w-0 flex-1 md:max-w-[200px]">
        <label className="text-[13px] font-medium text-white/80">{label}</label>
        {description ? (
          <p className="mt-1 text-[12px] text-white/40 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className={cn("w-full min-w-0 flex-1", valueClassName)}>
        {children}
      </div>
    </div>
  );
}
