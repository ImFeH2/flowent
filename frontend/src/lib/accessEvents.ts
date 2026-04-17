const ACCESS_DENIED_EVENT = "autopoe:access-denied";

export function dispatchAccessDeniedEvent() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(ACCESS_DENIED_EVENT));
}

export function subscribeAccessDeniedEvent(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(ACCESS_DENIED_EVENT, listener);
  return () => window.removeEventListener(ACCESS_DENIED_EVENT, listener);
}
