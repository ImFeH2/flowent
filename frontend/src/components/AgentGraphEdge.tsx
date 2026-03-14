import { motion } from "motion/react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function AnimatedMessageEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    id,
    data,
  } = props;
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const [reversePath] = getBezierPath({
    sourceX: targetX,
    sourceY: targetY,
    sourcePosition: targetPosition,
    targetX: sourceX,
    targetY: sourceY,
    targetPosition: sourcePosition,
  });
  const edgeData = (data as Record<string, unknown> | undefined) ?? {};
  const hasActiveMessage = !!edgeData.active;
  const leaving = !!edgeData.leaving;
  const flowDirection = edgeData.flowDirection === "reverse" ? -1 : 1;
  const motionPath = flowDirection === 1 ? edgePath : reversePath;
  const dashOffsetFrom = flowDirection === 1 ? "18" : "0";
  const dashOffsetTo = flowDirection === 1 ? "0" : "18";

  return (
    <motion.g
      className="agent-graph-edge-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: leaving ? 0.2 : 0.26, ease: [0.23, 1, 0.32, 1] }}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: hasActiveMessage
            ? "var(--graph-edge-active)"
            : "var(--graph-edge)",
          strokeWidth: hasActiveMessage ? 2.2 : 1.2,
          transition:
            "stroke 220ms ease, stroke-width 220ms ease, opacity 220ms ease",
        }}
      />
      {hasActiveMessage && (
        <>
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-edge-active)"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.18"
            filter="url(#agent-edge-glow)"
            initial={{ opacity: 0, pathLength: 0.68 }}
            animate={{ opacity: 0.18, pathLength: 1 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          />
          <motion.path
            d={edgePath}
            fill="none"
            stroke="url(#agent-edge-flow)"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray="10 8"
            opacity="0.95"
            filter="url(#agent-edge-glow)"
            initial={{ opacity: 0, pathLength: 0.76 }}
            animate={{ opacity: 0.95, pathLength: 1 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={dashOffsetFrom}
              to={dashOffsetTo}
              dur="0.7s"
              repeatCount="indefinite"
            />
          </motion.path>
          <circle r="3.2" fill="url(#agent-edge-pulse)">
            <animateMotion
              dur="0.72s"
              repeatCount="indefinite"
              path={motionPath}
            />
          </circle>
          <circle r="2.4" fill="url(#agent-edge-pulse)" opacity="0.82">
            <animateMotion
              dur="0.72s"
              repeatCount="indefinite"
              path={motionPath}
              begin="0.18s"
            />
          </circle>
          <circle r="1.9" fill="url(#agent-edge-pulse)" opacity="0.66">
            <animateMotion
              dur="0.72s"
              repeatCount="indefinite"
              path={motionPath}
              begin="0.36s"
            />
          </circle>
        </>
      )}
    </motion.g>
  );
}
