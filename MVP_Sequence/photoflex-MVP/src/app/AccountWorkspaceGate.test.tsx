// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, type AccountSession } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { AccountWorkspaceGate } from "./AccountWorkspaceGate";
import type { AppDependencies } from "./dependencies";
import { LocaleProvider } from "./locale";

afterEach(cleanup);

describe("AccountWorkspaceGate", () => {
  it("hides the local workspace after logout and opens an account-scoped workspace after login", async () => {
    const authListeners: Array<(user: { id: string; email?: string } | null) => void> = [];
    const accountSession: AccountSession = {
      getCurrentUser: vi.fn(async () => ok(null)),
      subscribe: vi.fn((listener) => { authListeners.push(listener); return () => undefined; }),
      signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
    };
    const base: AppDependencies = {
      projectStore: new MemoryProjectStore(),
      photoSource: new MemoryPhotoSource(),
      accountSession,
      accountWorkspaces: {
        open: vi.fn(() => ({
          dependencies: { projectStore: new MemoryProjectStore(), photoSource: new MemoryPhotoSource(), accountSession },
          close: vi.fn(async () => undefined),
        })),
      },
    };
    render(<LocaleProvider><AccountWorkspaceGate dependencies={base}>{() => <div>PRIVATE WORKSPACE</div>}</AccountWorkspaceGate></LocaleProvider>);
    expect(await screen.findByRole("heading", { name: "Sign in to Photoflex" })).toBeTruthy();
    expect(screen.queryByText("PRIVATE WORKSPACE")).toBeNull();

    authListeners.forEach((listener) => listener({ id: "account-a", email: "a@example.com" }));
    expect(await screen.findByText("PRIVATE WORKSPACE")).toBeTruthy();

    authListeners.forEach((listener) => listener(null));
    await waitFor(() => expect(screen.queryByText("PRIVATE WORKSPACE")).toBeNull());
  });

  it("switches between the sign-in and account-creation designs", async () => {
    const accountSession: AccountSession = {
      getCurrentUser: vi.fn(async () => ok(null)),
      subscribe: vi.fn(() => () => undefined),
      signIn: vi.fn(),
      signUp: vi.fn(async () => ok({ user: { id: "new-user" }, confirmationRequired: true })),
      signOut: vi.fn(),
    };
    const dependencies: AppDependencies = {
      projectStore: new MemoryProjectStore(),
      photoSource: new MemoryPhotoSource(),
      accountSession,
      accountWorkspaces: { open: vi.fn() },
    };

    render(<LocaleProvider><AccountWorkspaceGate dependencies={dependencies}>{() => <div>PRIVATE WORKSPACE</div>}</AccountWorkspaceGate></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Jane Smith"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(accountSession.signUp).toHaveBeenCalledWith("jane@example.com", "password", { fullName: "Jane Smith" }));
    expect(await screen.findByText("Check your email to confirm the account, then sign in.")).toBeTruthy();
  });
});
