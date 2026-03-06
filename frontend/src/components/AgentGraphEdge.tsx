import { BaseEdge, getStraightPath, type EdgeProps } from "@xyflow/react";

export function AnimatedMessageEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, id, data } = props;
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const hasActiveMessage = !!(data as Record<string, unknown> | undefined)
    ?.active;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: hasActiveMessage
            ? "var(--graph-edge-active)"
            : "var(--graph-edge)",
          strokeWidth: hasActiveMessage ? 2.2 : 1.2,
        }}
      />
      {hasActiveMessage && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke="url(#agent-edge-flow)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="8 6"
            opacity="0.8"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="14"
              to="0"
              dur="0.6s"
              repeatCount="indefinite"
            />
          </path>
          <circle r="2.6" fill="var(--graph-edge-active)">
            <animateMotion
              dur="0.5s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
          <circle r="2" fill="var(--graph-edge-active)" opacity="0.6">
            <animateMotion
              dur="0.5s"
              repeatCount="indefinite"
              path={edgePath}
              begin="0.25s"
            />
          </circle>
        </>
      )}
    </>
  );
}
