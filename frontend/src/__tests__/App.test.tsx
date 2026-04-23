import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import type { AccessState } from "@/types";

const accessStateRef: { value: AccessState } = vi.hoisted(() => ({
  value: {
    authenticated: false,
    configured: true,
    bootstrap_generated: false,
    requires_restart: false,
  } as AccessState,
}));

vi.mock("@/context/AccessContext", () => ({
  AccessProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/context/useAccess", () => ({
  useAccess: () => ({
    loading: false,
    state: accessStateRef.value,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    requireReauth: vi.fn(),
  }),
}));

describe("App access gate", () => {
  beforeEach(() => {
    accessStateRef.value = {
      authenticated: false,
      configured: true,
      bootstrap_generated: false,
      requires_restart: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("tells the user to read the current access code from the startup log", () => {
    render(<App />);

    expect(
      screen.getByText(
        /Read the current admin access code from the local startup log and enter it here to unlock the admin console/i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps the same startup-log guidance when the code was generated during startup", () => {
    accessStateRef.value = {
      authenticated: false,
      configured: true,
      bootstrap_generated: true,
      requires_restart: false,
    };

    render(<App />);

    expect(
      screen.getByText(
        /Read the current admin access code from the local startup log and enter it here to unlock the admin console/i,
      ),
    ).toBeInTheDocument();
  });

  it("asks for a restart after the access configuration was reset locally", () => {
    accessStateRef.value = {
      authenticated: false,
      configured: false,
      bootstrap_generated: false,
      requires_restart: true,
    };

    render(<App />);

    expect(
      screen.getByText(
        /Access was reset locally\. Restart Autopoe to generate a new access code in the startup log\./i,
      ),
    ).toBeInTheDocument();
  });
});
