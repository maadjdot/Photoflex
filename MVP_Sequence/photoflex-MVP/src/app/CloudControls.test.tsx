// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ok, type AccountSession, type ProjectId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { LocaleProvider } from "./locale";
import { CloudControls } from "./CloudControls";

afterEach(cleanup);
describe("CloudControls", () => {
  it("does not offer manual backup or sync when CloudBase is unconfigured", () => {
    render(<LocaleProvider><CloudControls dependencies={{ projectStore: new MemoryProjectStore(), photoSource: new MemoryPhotoSource() }} /></LocaleProvider>);
    expect(screen.queryByRole("button", { name: /Sync|Login/ })).toBeNull();
  });

  it("shows automatic cloud save status and sign out", async () => {
    const user = { id: "user-1", email: "photo@example.com" };
    const accountSession: AccountSession = {
      getCurrentUser: vi.fn(async () => ok(user)),
      subscribe: vi.fn(() => () => undefined),
      signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(async () => ok(undefined)),
    };
    let notify: (() => void) | undefined;
    let status = "saved" as "saved" | "saving";
    const cloudSave = { subscribe: (listener: () => void) => { notify = listener; return () => undefined; }, getStatus: () => status };
    render(<LocaleProvider><CloudControls projectId={"project-1" as ProjectId} dependencies={{ projectStore: new MemoryProjectStore(), photoSource: new MemoryPhotoSource(), accountSession, cloudSave }} /></LocaleProvider>);
    expect(await screen.findByText("Saved to cloud")).toBeTruthy();
    act(() => { status = "saving"; notify?.(); });
    expect(screen.getByText("Saving to cloud…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sync" })).toBeNull();
    screen.getByRole("button", { name: "Sign out" }).click();
    await waitFor(() => expect(accountSession.signOut).toHaveBeenCalled());
  });
});
