import { cn } from "@/lib/utils";
import type { ModelParams } from "@/types";

interface ModelParamsFieldsProps {
  className?: string;
  disabled?: boolean;
  helperText?: string;
  onChange: (next: ModelParams) => void;
  value: ModelParams;
}

function parseNumberInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ModelParamsFields({
  className,
  disabled = false,
  helperText,
  onChange,
  value,
}: ModelParamsFieldsProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Reasoning Effort</label>
          <select
            value={value.reasoning_effort ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                reasoning_effort: event.target.value
                  ? (event.target.value as ModelParams["reasoning_effort"])
                  : null,
              })
            }
            disabled={disabled}
            className={cn(
              "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200",
              disabled
                ? "cursor-default text-muted-foreground focus:outline-none"
                : "focus:border-white/16 focus:outline-none",
            )}
          >
            <option value="">Inherit / provider default</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Verbosity</label>
          <select
            value={value.verbosity ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                verbosity: event.target.value
                  ? (event.target.value as ModelParams["verbosity"])
                  : null,
              })
            }
            disabled={disabled}
            className={cn(
              "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200",
              disabled
                ? "cursor-default text-muted-foreground focus:outline-none"
                : "focus:border-white/16 focus:outline-none",
            )}
          >
            <option value="">Inherit / provider default</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Max Output Tokens</label>
          <input
            type="number"
            min={1}
            step={1}
            value={value.max_output_tokens ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                max_output_tokens: parseNumberInput(event.target.value),
              })
            }
            disabled={disabled}
            placeholder="Inherit / provider default"
            className={cn(
              "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground",
              disabled
                ? "cursor-default text-muted-foreground focus:outline-none"
                : "focus:border-white/16 focus:outline-none",
            )}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Temperature</label>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={value.temperature ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                temperature: parseNumberInput(event.target.value),
              })
            }
            disabled={disabled}
            placeholder="Inherit / provider default"
            className={cn(
              "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground",
              disabled
                ? "cursor-default text-muted-foreground focus:outline-none"
                : "focus:border-white/16 focus:outline-none",
            )}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium">Top P</label>
          <input
            type="number"
            min={0.01}
            max={1}
            step={0.01}
            value={value.top_p ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                top_p: parseNumberInput(event.target.value),
              })
            }
            disabled={disabled}
            placeholder="Inherit / provider default"
            className={cn(
              "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground",
              disabled
                ? "cursor-default text-muted-foreground focus:outline-none"
                : "focus:border-white/16 focus:outline-none",
            )}
          />
        </div>
      </div>

      {helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
