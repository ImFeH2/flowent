import { motion } from "motion/react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function AgentEdge(props: EdgeProps) {
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
  const trailOffsetFrom = flowDirection === 1 ? "32" : "0";
  const trailOffsetTo = flowDirection === 1 ? "0" : "32";
  const trailParticles = [
    { radius: 5.4, opacity: 0.12, begin: "0s", glow: true },
    { radius: 3.8, opacity: 0.95, begin: "0s", glow: false },
    { radius: 3.2, opacity: 0.62, begin: "0.06s", glow: false },
    { radius: 2.7, opacity: 0.42, begin: "0.12s", glow: false },
    { radius: 2.2, opacity: 0.28, begin: "0.18s", glow: false },
    { radius: 1.8, opacity: 0.18, begin: "0.24s", glow: false },
  ] as const;

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
            stroke="url(#agent-graph-edge-flow)"
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
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-edge-active)"
            strokeWidth="5.8"
            strokeLinecap="round"
            strokeDasharray="22 30"
            opacity="0.22"
            filter="url(#agent-edge-glow)"
            initial={{ opacity: 0, pathLength: 0.72 }}
            animate={{ opacity: 0.22, pathLength: 1 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={trailOffsetFrom}
              to={trailOffsetTo}
              dur="0.72s"
              repeatCount="indefinite"
            />
          </motion.path>
          {trailParticles.map((particle) => (
            <circle
              key={`${id}-${particle.radius}-${particle.begin}`}
              r={particle.radius}
              fill="url(#agent-graph-edge-pulse)"
              opacity={particle.opacity}
              filter={particle.glow ? "url(#agent-graph-edge-glow)" : undefined}
            >
              <animateMotion
                dur="0.72s"
                repeatCount="indefinite"
                path={motionPath}
                begin={particle.begin}
              />
            </circle>
          ))}
        </>
      )}
    </motion.g>
  );
}
