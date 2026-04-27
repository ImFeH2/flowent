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

import type { FlowNode, RunStatus, TriggerMode } from "./model";
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

export function WorkflowNode({ data, selected }: NodeProps<FlowNode>) {
  const StatusIcon = statusIcon[data.status];
  const TriggerIcon = triggerIcon[data.triggerMode ?? "manual"];
  const isTrigger = data.kind === "trigger";
  const showRunStatus = data.canvasMode === "workflow";
  const onSelectNode =
    typeof data.onSelectNode === "function"
      ? (data.onSelectNode as () => void)
      : undefined;

  return (
    <Card
      onClick={onSelectNode}
      className={cn(
        "w-72 border bg-card/95 shadow-md transition-colors",
        selected && "border-ring ring-2 ring-ring/30",
        showRunStatus && data.status === "running" && "border-primary/70",
        showRunStatus && data.status === "success" && "border-chart-2/70",
        showRunStatus && data.status === "error" && "border-destructive/80",
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
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background">
            {isTrigger ? (
              <TriggerIcon className="size-6" />
            ) : data.avatar ? (
              <span className="text-base font-medium">{data.avatar}</span>
            ) : (
              <BotIcon className="size-6" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-medium">{data.title}</div>
          </div>
        </div>
        {showRunStatus && (
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant={data.status === "error" ? "destructive" : "secondary"}
              className="gap-1.5 px-3 py-1 text-sm"
            >
              <StatusIcon className="size-4" />
              {runStatusLabels[data.status]}
            </Badge>
          </div>
        )}
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
