import { describe, expect, it } from "vitest";
import { AGENT_NODE_HEIGHT, getLayoutedElements } from "@/lib/layout";

describe("getLayoutedElements", () => {
  it("keeps dependency layers readable for connected structures", () => {
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

    expect(source?.position.y ?? 0).toBeLessThan(left?.position.y ?? 0);
    expect(source?.position.y ?? 0).toBeLessThan(right?.position.y ?? 0);
    expect(sink?.position.y ?? 0).toBeGreaterThan(left?.position.y ?? 0);
    expect(sink?.position.y ?? 0).toBeGreaterThan(right?.position.y ?? 0);
    expect(left?.position.y).toBe(right?.position.y);
    expect(left?.position.x).not.toBe(right?.position.x);
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
