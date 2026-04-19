import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ShellBackgroundVariant = "app" | "access";
type ShellSurfaceVariant = "workspace" | "page" | "access";

const backgroundStyles: Record<
  ShellBackgroundVariant,
  {
    base: string;
    primarySpotlight: string;
    secondarySpotlight: string;
  }
> = {
  app: {
    base: "var(--shell-app-bg)",
    primarySpotlight: "var(--shell-app-spotlight-primary)",
    secondarySpotlight: "var(--shell-app-spotlight-secondary)",
  },
  access: {
    base: "var(--shell-access-bg)",
    primarySpotlight: "var(--shell-access-spotlight-primary)",
    secondarySpotlight: "var(--shell-access-spotlight-secondary)",
  },
};

const surfaceStyles: Record<ShellSurfaceVariant, string> = {
  workspace: "var(--shell-surface-workspace)",
  page: "var(--shell-surface-page)",
  access: "var(--shell-surface-access)",
};

interface ShellBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant: ShellBackgroundVariant;
}

interface ShellSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant: ShellSurfaceVariant;
}

export function ShellBackground({
  children,
  className,
  style,
  variant,
  ...props
}: ShellBackgroundProps) {
  const tokens = backgroundStyles[variant];

  return (
    <div
      {...props}
      className={cn(
        "relative overflow-hidden",
        variant === "app" ? "h-screen" : "min-h-screen",
        className,
      )}
      style={
        {
          ...style,
          background: tokens.base,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `${tokens.primarySpotlight}, ${tokens.secondarySpotlight}`,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--shell-sweep)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: "var(--shell-noise-opacity)",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--shell-noise-dot) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
      {children}
    </div>
  );
}

export function ShellSurface({
  children,
  className,
  style,
  variant,
  ...props
}: ShellSurfaceProps) {
  return (
    <div
      {...props}
      className={cn("relative isolate overflow-hidden", className)}
      style={
        {
          ...style,
          background: surfaceStyles[variant],
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--shell-surface-sweep)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--shell-hairline)" }}
      />
      {children}
    </div>
  );
}
