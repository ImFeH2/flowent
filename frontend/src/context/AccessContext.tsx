import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchAccessState, loginAccess, logoutAccess } from "@/lib/api";
import { subscribeAccessDeniedEvent } from "@/lib/accessEvents";
import type { AccessState } from "@/types";
import { AccessContext } from "@/context/accessContext.shared";

const EMPTY_ACCESS_STATE: AccessState = {
  authenticated: false,
  configured: false,
  bootstrap_generated: false,
  requires_restart: false,
};

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>(EMPTY_ACCESS_STATE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const nextState = await fetchAccessState();
      setState(nextState);
      return nextState;
    } catch {
      let currentState = EMPTY_ACCESS_STATE;
      setState((current) => {
        currentState = current;
        return current;
      });
      return currentState;
    }
  }, []);

  const requireReauth = useCallback(() => {
    setState((current) =>
      current.authenticated ? { ...current, authenticated: false } : current,
    );
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    fetchAccessState()
      .then((nextState) => {
        if (cancelled) {
          return;
        }
        setState(nextState);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setState(EMPTY_ACCESS_STATE);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeAccessDeniedEvent(requireReauth);
  }, [requireReauth]);

  const login = useCallback(async (code: string) => {
    const nextState = await loginAccess(code);
    setState(nextState);
    return nextState;
  }, []);

  const logout = useCallback(async () => {
    const nextState = await logoutAccess();
    setState(nextState);
    return nextState;
  }, []);

  const value = useMemo(
    () => ({
      loading,
      state,
      login,
      logout,
      refresh,
      requireReauth,
    }),
    [loading, state, login, logout, refresh, requireReauth],
  );

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}
