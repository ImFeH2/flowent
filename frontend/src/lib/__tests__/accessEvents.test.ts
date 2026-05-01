import { describe, expect, it, vi } from "vitest";
import {
  dispatchAccessDeniedEvent,
  subscribeAccessDeniedEvent,
} from "@/lib/accessEvents";

describe("accessEvents", () => {
  it("notifies current subscribers and stops after unsubscribe", () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribeFirst = subscribeAccessDeniedEvent(firstListener);
    subscribeAccessDeniedEvent(secondListener);

    dispatchAccessDeniedEvent();

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    dispatchAccessDeniedEvent();

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
  });
});
