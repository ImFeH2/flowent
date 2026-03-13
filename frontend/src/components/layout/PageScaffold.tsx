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
        "rounded-lg border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.032),rgba(255,255,255,0.018))] p-4 backdrop-blur-xl md:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
