import { cn } from "@/lib/utils";

interface PageLoadingStateProps {
  barClassName?: string;
  className?: string;
  label: string;
  textClassName?: string;
}

export function PageLoadingState({
  barClassName,
  className,
  label,
  textClassName,
}: PageLoadingStateProps) {
  return (
    <div className={cn("flex h-full items-center justify-center", className)}>
      <div className="space-y-3 text-center">
        <div
          className={cn(
            "mx-auto h-2 w-32 animate-pulse rounded-full bg-accent/30",
            barClassName,
          )}
        />
        <p className={cn("text-sm text-muted-foreground", textClassName)}>
          {label}
        </p>
      </div>
    </div>
  );
}
