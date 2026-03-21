import { Layers3, Route } from "lucide-react";
import { motion } from "motion/react";
import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

interface FormationGroupNodeData {
  formationId: string;
  label: string;
  goal: string;
  depth: number;
  nodeCount: number;
  childFormationCount: number;
  [key: string]: unknown;
}

export function AgentGroupNode({ data }: NodeProps) {
  const { label, goal, depth, nodeCount, childFormationCount } =
    data as FormationGroupNodeData;
  const leaving = Boolean((data as FormationGroupNodeData).leaving);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985, y: 10 }}
      animate={{
        opacity: leaving ? 0 : 1,
        scale: leaving ? 0.98 : 1,
        y: leaving ? 8 : 0,
      }}
      transition={{ duration: leaving ? 0.26 : 0.32, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-sm",
        leaving && "pointer-events-none",
        depth > 0 && "bg-white/[0.014]",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-11 border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.012))]" />
      <div className="relative flex h-full flex-col">
        <div className="flex min-h-11 items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-sm border border-white/[0.08] bg-white/[0.045] text-foreground/75">
                <Layers3 className="size-3" />
              </span>
              <p className="truncate text-[11px] font-semibold tracking-[0.01em] text-foreground/88">
                {label}
              </p>
            </div>
            {goal ? (
              <p className="mt-1 truncate text-[10px] text-muted-foreground/85">
                {goal}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 rounded-sm border border-white/[0.06] bg-black/15 px-2 py-1 text-[10px] font-medium text-muted-foreground/90">
            {nodeCount} nodes
          </div>
        </div>

        <div className="pointer-events-none mt-auto flex items-center gap-3 px-4 pb-3 text-[10px] text-muted-foreground/72">
          <span className="inline-flex items-center gap-1">
            <Route className="size-3" />
            {childFormationCount} formations
          </span>
        </div>
      </div>
    </motion.div>
  );
}
