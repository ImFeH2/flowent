"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { ElementType } from "react";
import {
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  PlayIcon,
  SparklesIcon,
  TimerIcon,
  WebhookIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { FlowNode, ModelPreset, RunStatus, TriggerMode } from "./model";
import { runStatusLabels } from "./model";

const statusIcon: Record<RunStatus, ElementType> = {
  idle: ClockIcon,
  pending: TimerIcon,
  running: SparklesIcon,
  success: CircleCheckIcon,
  error: CircleAlertIcon,
};

const triggerIcon: Record<TriggerMode, ElementType> = {
  manual: PlayIcon,
  schedule: TimerIcon,
  webhook: WebhookIcon,
};

function getPresetLabel(
  modelPresetId: string | undefined,
  modelPresets: ModelPreset[],
) {
  const preset = modelPresets.find((item) => item.id === modelPresetId);

  return preset?.modelId ?? "No model";
}

export function WorkflowNode({ data, selected }: NodeProps<FlowNode>) {
  const StatusIcon = statusIcon[data.status];
  const TriggerIcon = triggerIcon[data.triggerMode ?? "manual"];
  const modelPresets = (data.modelPresets as ModelPreset[] | undefined) ?? [];
  const isTrigger = data.kind === "trigger";

  return (
    <Card
      className={cn(
        "w-64 border bg-card/95 shadow-sm transition-colors",
        selected && "border-ring ring-2 ring-ring/30",
        data.status === "running" && "border-primary/70",
        data.status === "success" && "border-chart-2/70",
        data.status === "error" && "border-destructive/80",
      )}
    >
      {!isTrigger && (
        <Handle
          id="input"
          type="target"
          position={Position.Left}
          className="size-3"
        />
      )}
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
            {isTrigger ? (
              <TriggerIcon className="size-4" />
            ) : data.avatar ? (
              <span className="text-xs font-medium">{data.avatar}</span>
            ) : (
              <BotIcon className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{data.title}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {isTrigger
                ? `${runStatusLabels[data.status]} trigger`
                : getPresetLabel(data.modelPresetId, modelPresets)}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant={data.status === "error" ? "destructive" : "secondary"}
            className="gap-1.5"
          >
            <StatusIcon className="size-3" />
            {runStatusLabels[data.status]}
          </Badge>
          {!isTrigger && data.status === "running" && (
            <span className="text-xs text-muted-foreground">Thinking...</span>
          )}
        </div>
      </CardContent>
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="size-3"
      />
    </Card>
  );
}
