import { memo } from "react";
import { motion } from "motion/react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export const AgentEdge = memo(function AgentEdge(props: EdgeProps) {
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

  const edgeData = (data as Record<string, unknown> | undefined) ?? {};
  const hasActiveMessage = !!edgeData.active;
  const leaving = !!edgeData.leaving;
  const flowDirection = edgeData.flowDirection === "reverse" ? -1 : 1;
  const selected = edgeData.selected === true;

  // Calculate dash offsets based on direction for the continuous dotted stream
  const dashOffsetFrom = flowDirection === 1 ? "48" : "0";
  const dashOffsetTo = flowDirection === 1 ? "0" : "48";

  return (
    <motion.g
      className="agent-graph-edge-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: leaving ? 0.2 : 0.3, ease: "easeInOut" }}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: hasActiveMessage
            ? "var(--graph-edge-active)"
            : selected
              ? "var(--graph-selection)"
              : "var(--graph-edge)",
          strokeWidth: hasActiveMessage ? 2.5 : selected ? 2.4 : 1.5,
          transition:
            "stroke 300ms ease, stroke-width 300ms ease, opacity 300ms ease",
        }}
      />
      {selected && !hasActiveMessage ? (
        <motion.path
          d={edgePath}
          fill="none"
          stroke="var(--graph-selection)"
          strokeWidth="7"
          strokeLinecap="round"
          filter="url(#agent-graph-edge-glow)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.16 }}
          transition={{ duration: 0.18 }}
        />
      ) : null}
      {hasActiveMessage && (
        <>
          {/* Ambient Glow - Thick and subtly pulsing */}
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-edge-active)"
            strokeWidth="8"
            strokeLinecap="round"
            filter="url(#agent-graph-edge-glow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.3, 0.1] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Continuous Flow - Flowing dashed lines to simulate data transfer */}
          <motion.path
            d={edgePath}
            fill="none"
            stroke="url(#agent-graph-edge-flow)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="12 12"
            opacity="0.8"
            filter="url(#agent-graph-edge-glow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            transition={{ duration: 0.4 }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={dashOffsetFrom}
              to={dashOffsetTo}
              dur="0.8s"
              repeatCount="indefinite"
            />
          </motion.path>

          {/* The Data Comet - A bright, fast moving segment that shoots across the line */}
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-edge-active)"
            strokeWidth="5"
            strokeLinecap="round"
            filter="url(#agent-graph-edge-glow)"
            initial={{
              pathLength: 0.15,
              pathOffset: flowDirection === 1 ? -0.2 : 1.2,
              opacity: 0,
            }}
            animate={{
              pathOffset: flowDirection === 1 ? 1.2 : -0.2,
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.5,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "loop",
              times: [0, 0.1, 0.9, 1], // Quick fade in, hold, quick fade out
            }}
          />

          {/* Secondary smaller comet core for a cool white-hot energy effect */}
          <motion.path
            d={edgePath}
            fill="none"
            stroke="var(--graph-attention)"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#agent-graph-edge-glow)"
            initial={{
              pathLength: 0.08,
              pathOffset: flowDirection === 1 ? -0.23 : 1.23,
              opacity: 0,
            }}
            animate={{
              pathOffset: flowDirection === 1 ? 1.17 : -0.17,
              opacity: [0, 0.9, 0.9, 0],
            }}
            transition={{
              duration: 1.5,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "loop",
              times: [0, 0.1, 0.9, 1],
              delay: 0.03, // slightly offset behind the main comet
            }}
          />
        </>
      )}
    </motion.g>
  );
});
