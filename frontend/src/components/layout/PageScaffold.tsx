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
    <div className={cn("flex h-full flex-col p-6 md:p-8", className)}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
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
        "rounded-3xl border border-glass-border bg-surface-raised p-5 shadow-lg backdrop-blur-xl ios-card-shadow",
        className,
      )}
    >
      {children}
    </section>
  );
}
