import { BaseEdge, getStraightPath, type EdgeProps } from "@xyflow/react";

export function AnimatedMessageEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, id, data } = props;
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const [reversePath] = getStraightPath({
    sourceX: targetX,
    sourceY: targetY,
    targetX: sourceX,
    targetY: sourceY,
  });
  const edgeData = (data as Record<string, unknown> | undefined) ?? {};
  const hasActiveMessage = !!edgeData.active;
  const flowDirection = edgeData.flowDirection === "reverse" ? -1 : 1;
  const motionPath = flowDirection === 1 ? edgePath : reversePath;
  const dashOffsetFrom = flowDirection === 1 ? "18" : "0";
  const dashOffsetTo = flowDirection === 1 ? "0" : "18";

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
            stroke="var(--graph-edge-active)"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.18"
            filter="url(#agent-edge-glow)"
          />
          <path
            d={edgePath}
            fill="none"
            stroke="url(#agent-edge-flow)"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray="10 8"
            opacity="0.95"
            filter="url(#agent-edge-glow)"
          >
            <animate
              attributeName="stroke-dashoffset"
              from={dashOffsetFrom}
              to={dashOffsetTo}
              dur="0.7s"
              repeatCount="indefinite"
            />
          </path>
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
    </>
  );
}
