const listeners = new Set<() => void>();

export function dispatchAccessDeniedEvent() {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeAccessDeniedEvent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
