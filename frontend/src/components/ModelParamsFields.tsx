import { cn } from "@/lib/utils";
import type { ModelParams } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ModelParamsFieldsProps {
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  helperText?: string;
  numberPlaceholder?: string;
  onChange: (next: ModelParams) => void;
  reasoningDisableLabel?: string | null;
  value: ModelParams;
}

const EMPTY_OPTION_VALUE = "__empty__";

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
  emptyLabel = "Inherit / provider default",
  helperText,
  numberPlaceholder = emptyLabel,
  onChange,
  reasoningDisableLabel = "None",
  value,
}: ModelParamsFieldsProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Reasoning Effort</label>
          <Select
            value={value.reasoning_effort ?? EMPTY_OPTION_VALUE}
            onValueChange={(nextValue) =>
              onChange({
                ...value,
                reasoning_effort:
                  nextValue !== EMPTY_OPTION_VALUE
                    ? (nextValue as ModelParams["reasoning_effort"])
                    : null,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="rounded-md border-white/8 bg-black/[0.22]">
              <SelectValue placeholder={emptyLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_OPTION_VALUE}>{emptyLabel}</SelectItem>
              {reasoningDisableLabel ? (
                <SelectItem value="none">{reasoningDisableLabel}</SelectItem>
              ) : null}
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="xhigh">XHigh</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Verbosity</label>
          <Select
            value={value.verbosity ?? EMPTY_OPTION_VALUE}
            onValueChange={(nextValue) =>
              onChange({
                ...value,
                verbosity:
                  nextValue !== EMPTY_OPTION_VALUE
                    ? (nextValue as ModelParams["verbosity"])
                    : null,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="rounded-md border-white/8 bg-black/[0.22]">
              <SelectValue placeholder={emptyLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_OPTION_VALUE}>{emptyLabel}</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
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
            placeholder={numberPlaceholder}
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
            placeholder={numberPlaceholder}
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
            placeholder={numberPlaceholder}
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
