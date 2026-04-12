import "@testing-library/jest-dom/vitest";
import type { Edge, Node } from "@xyflow/react";
import { getLayoutedElements } from "../lib/layout";

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(performance.now()), 16);
}

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = (handle) => {
    window.clearTimeout(handle);
  };
}

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

class WorkerMock {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  postMessage(data: { nodes: Node[]; edges: Edge[]; key: string }) {
    if (this.onmessage) {
      const layouted = getLayoutedElements(data.nodes, data.edges);
      const positions = layouted.nodes.map((n) => ({
        id: n.id,
        position: n.position,
      }));
      this.onmessage({ data: { positions, key: data.key } } as MessageEvent);
    }
  }
  terminate() {}
}

Object.defineProperty(globalThis, "Worker", {
  value: WorkerMock,
});
