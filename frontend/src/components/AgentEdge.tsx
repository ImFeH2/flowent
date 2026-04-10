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
    { radius: 3.5, opacity: 0.15, begin: "0s", glow: true },
    { radius: 2.5, opacity: 0.8, begin: "0s", glow: false },
    { radius: 2.0, opacity: 0.5, begin: "0.08s", glow: false },
    { radius: 1.5, opacity: 0.3, begin: "0.16s", glow: false },
    { radius: 1.0, opacity: 0.15, begin: "0.24s", glow: false },
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
          strokeWidth: hasActiveMessage ? 2.0 : 1.5,
          transition:
            "stroke 300ms ease, stroke-width 300ms ease, opacity 300ms ease",
        }}
      />
      {hasActiveMessage && (
        <>
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-edge-active)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.3"
            filter="url(#agent-edge-glow)"
            initial={{ opacity: 0, pathLength: 0.68 }}
            animate={{ opacity: 0.3, pathLength: 1 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          />
          <motion.path
            d={edgePath}
            fill="none"
            stroke="url(#agent-graph-edge-flow)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="12 12"
            opacity="1"
            filter="url(#agent-edge-glow)"
            initial={{ opacity: 0, pathLength: 0.76 }}
            animate={{ opacity: 1, pathLength: 1 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={dashOffsetFrom}
              to={dashOffsetTo}
              dur="0.8s"
              repeatCount="indefinite"
            />
          </motion.path>
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-edge-active)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="30 40"
            opacity="0.4"
            filter="url(#agent-edge-glow)"
            initial={{ opacity: 0, pathLength: 0.72 }}
            animate={{ opacity: 0.4, pathLength: 1 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={trailOffsetFrom}
              to={trailOffsetTo}
              dur="0.82s"
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
                dur="0.82s"
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
