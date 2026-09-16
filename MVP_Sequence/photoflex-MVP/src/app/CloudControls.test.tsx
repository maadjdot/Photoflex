// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok, type AccountError, type AccountSession } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { LocaleProvider } from "./locale";
import { CloudControls } from "./CloudControls";

afterEach(cleanup);

describe("CloudControls", () => {
  it("keeps login disabled when this checkout has no Supabase configuration", () => {
    render(<LocaleProvider><CloudControls dependencies={{ projectStore: new MemoryProjectStore(), photoSource: new MemoryPhotoSource() }} /></LocaleProvider>);
    expect((screen.getByRole("button", { name: "Login" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("signs in through the injected account seam", async () => {
    let listener: ((user: { id: string; email?: string } | null) => void) | undefined;
    const accountSession: AccountSession = {
      getCurrentUser: vi.fn(async () => ok(null)),
      subscribe: vi.fn((next) => { listener = next; return () => undefined; }),
      signIn: vi.fn(async () => { const user = { id: "user-1", email: "photo@example.com" }; listener?.(user); return ok(user); }),
      signUp: vi.fn(async () => err<AccountError>({ kind: "unavailable", retryable: false })),
      signOut: vi.fn(async () => ok(undefined)),
    };
    render(<LocaleProvider><CloudControls dependencies={{ projectStore: new MemoryProjectStore(), photoSource: new MemoryPhotoSource(), accountSession }} /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "photo@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(accountSession.signIn).toHaveBeenCalledWith("photo@example.com", "password123"));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
