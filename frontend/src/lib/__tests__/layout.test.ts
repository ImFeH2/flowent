import { describe, expect, it } from "vitest";
import { AGENT_NODE_HEIGHT, getLayoutedElements } from "@/lib/layout";

describe("getLayoutedElements", () => {
  it("keeps connected structures spread into a readable undirected layout", () => {
    const { nodes } = getLayoutedElements(
      [
        {
          id: "source",
          position: { x: 0, y: 0 },
          data: { label: "Source" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "left",
          position: { x: 0, y: 0 },
          data: { label: "Left" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "right",
          position: { x: 0, y: 0 },
          data: { label: "Right" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "sink",
          position: { x: 0, y: 0 },
          data: { label: "Sink" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
      ],
      [
        { id: "source->left", source: "source", target: "left" },
        { id: "source->right", source: "source", target: "right" },
        { id: "left->sink", source: "left", target: "sink" },
        { id: "right->sink", source: "right", target: "sink" },
      ],
    );

    const source = nodes.find((node) => node.id === "source");
    const left = nodes.find((node) => node.id === "left");
    const right = nodes.find((node) => node.id === "right");
    const sink = nodes.find((node) => node.id === "sink");

    const positionKeys = new Set(
      nodes.map(
        (node) =>
          `${Math.round(node.position.x)}:${Math.round(node.position.y)}`,
      ),
    );

    expect(positionKeys.size).toBe(4);
    expect(
      Math.abs((left?.position.x ?? 0) - (right?.position.x ?? 0)),
    ).toBeGreaterThan(40);
    expect(
      Math.hypot(
        (source?.position.x ?? 0) - (sink?.position.x ?? 0),
        (source?.position.y ?? 0) - (sink?.position.y ?? 0),
      ),
    ).toBeGreaterThan(80);
  });

  it("groups isolated nodes into a grid below connected components", () => {
    const { nodes } = getLayoutedElements(
      [
        {
          id: "source",
          position: { x: 0, y: 0 },
          data: { label: "Source" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "sink",
          position: { x: 0, y: 0 },
          data: { label: "Sink" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "solo-a",
          position: { x: 0, y: 0 },
          data: { label: "Solo A" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "solo-b",
          position: { x: 0, y: 0 },
          data: { label: "Solo B" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "solo-c",
          position: { x: 0, y: 0 },
          data: { label: "Solo C" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
        {
          id: "solo-d",
          position: { x: 0, y: 0 },
          data: { label: "Solo D" },
          width: 164,
          height: AGENT_NODE_HEIGHT,
        },
      ],
      [{ id: "source->sink", source: "source", target: "sink" }],
    );

    const sink = nodes.find((node) => node.id === "sink");
    const isolatedNodes = nodes.filter((node) => node.id.startsWith("solo-"));
    const isolatedRows = new Set(isolatedNodes.map((node) => node.position.y));

    expect(isolatedNodes).toHaveLength(4);
    expect(isolatedRows.size).toBeGreaterThan(1);
    for (const node of isolatedNodes) {
      expect(node.position.y).toBeGreaterThan(sink?.position.y ?? 0);
    }
  });
});
