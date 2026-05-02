import { FormSwitch } from "@/components/form/FormControls";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const mcpEyebrowClass =
  "text-[12px] font-medium text-muted-foreground/80";

const mcpMetricEyebrowClass =
  "text-[12px] font-medium text-muted-foreground/80";
const mcpMetricCardClass =
  "rounded-xl border border-border bg-card/20 px-4 py-4";
const mcpReadonlyBlockClass =
  "min-h-[44px] whitespace-pre-wrap break-all rounded-xl border border-border bg-background/40 px-4 py-3 text-[12px] leading-6 text-foreground/80";
const mcpFilterPillBaseClass =
  "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const mcpLineTabBaseClass =
  "inline-flex h-8 -mb-px items-center border-b-2 px-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={mcpMetricCardClass}>
      <p className={mcpMetricEyebrowClass}>{label}</p>
      <p className="mt-2 text-[26px] font-medium text-foreground">{value}</p>
    </div>
  );
}

export function FilterPill({
  active,
  label,
  onClick,
  variant = "pill",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  variant?: "pill" | "tab";
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        variant === "pill" ? mcpFilterPillBaseClass : mcpLineTabBaseClass,
        variant === "pill"
          ? active
            ? "border-border bg-card/30 text-foreground"
            : "border-transparent bg-card/20 text-muted-foreground hover:bg-accent/25 hover:text-foreground"
          : active
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Button>
  );
}

export function ReadonlyBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className={mcpEyebrowClass}>{label}</p>
      <pre
        className={cn(mcpReadonlyBlockClass, mono && "font-mono text-[11px]")}
      >
        {value}
      </pre>
    </div>
  );
}

export function MountToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-border bg-card/20 px-4 py-3 text-sm",
        disabled && "opacity-50",
      )}
    >
      <span className="text-foreground/85">{label}</span>
      <FormSwitch
        checked={checked}
        disabled={disabled}
        label={label}
        onCheckedChange={onChange}
        className="h-6 w-11"
      />
    </label>
  );
}
