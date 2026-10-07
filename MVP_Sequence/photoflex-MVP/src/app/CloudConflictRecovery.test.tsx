// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { err, ok, type BackupError, type LoadError, type ProjectId, type Result } from "../contracts";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { CloudConflictRecovery } from "./CloudConflictRecovery";
import { downloadRecoveryBackup } from "./downloadRecoveryBackup";
import { LocaleProvider } from "./locale";
vi.mock("./downloadRecoveryBackup", () => ({ downloadRecoveryBackup: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function setup(beforeRecovery = vi.fn(async () => true)) {
  const id = "conflicted-project" as ProjectId, copy = "recovery-copy" as ProjectId;
  const projectStore = new MemoryProjectStore();
  await projectStore.createProject({ id, name: "My photos", createdAt: "now" });
  let conflict = true; const listeners = new Set<() => void>();
  const save = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getStatus: () => "conflict" as const,
    getConflictProjectIds: () => conflict ? [id] : [],
    saveConflictCopy: vi.fn(async () => ok(copy)),
    resolveConflict: vi.fn(async (): Promise<Result<ProjectId, LoadError | BackupError>> => { conflict = false; listeners.forEach((listener) => listener()); return ok(copy); }),
  };
  const onOpenCopy = vi.fn(), onReloadCloud = vi.fn();
  render(<LocaleProvider><CloudConflictRecovery dependencies={{ projectStore, photoSource: new MemoryPhotoSource(), cloudSave: save }}
    beforeRecovery={beforeRecovery} onOpenCopy={onOpenCopy} onReloadCloud={onReloadCloud} /></LocaleProvider>);
  await screen.findByText(/Cloud save conflict.*My photos/);
  return { id, copy, save, projectStore, beforeRecovery, onOpenCopy, onReloadCloud };
}
it("keeps the recovery alert available on Home and downloads the retained local content", async () => {
  const f = await setup();
  fireEvent.click(screen.getByRole("button", { name: "Download recovery backup" }));
  await waitFor(() => expect(downloadRecoveryBackup).toHaveBeenCalledOnce());
  const bytes = vi.mocked(downloadRecoveryBackup).mock.calls[0][0];
  expect(JSON.parse(new TextDecoder().decode(bytes)).project.name).toBe("My photos");
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(f.onReloadCloud).not.toHaveBeenCalled();
});
it("opens a separate copy while retaining the original conflict", async () => {
  const f = await setup();
  fireEvent.click(screen.getByRole("button", { name: "Save and open a separate copy" }));
  await waitFor(() => expect(f.onOpenCopy).toHaveBeenCalledWith(f.copy));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(f.save.resolveConflict).not.toHaveBeenCalled();
});
it("waits for the local save barrier and remounts only after preserving a copy and loading cloud", async () => {
  let release!: (value: boolean) => void;
  const barrier = new Promise<boolean>((resolve) => { release = resolve; });
  const f = await setup(vi.fn(() => barrier));
  fireEvent.click(screen.getByRole("button", { name: "Keep a copy and load cloud version" }));
  expect(f.save.resolveConflict).not.toHaveBeenCalled();
  await act(async () => { release(true); });
  await waitFor(() => expect(f.onReloadCloud).toHaveBeenCalledWith(f.id));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open recovery copy" }));
  expect(f.onOpenCopy).toHaveBeenCalledWith(f.copy);
});
it("retains the alert and current workspace when preserving a copy fails", async () => {
  const f = await setup();
  f.save.resolveConflict.mockResolvedValueOnce(err({ kind: "quota-exceeded" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep a copy and load cloud version" }));
  await screen.findByText(/Recovery did not complete/);
  expect(f.onReloadCloud).not.toHaveBeenCalled();
  expect(await f.projectStore.loadWorkspace(f.id)).toMatchObject({ ok: true, value: { name: "My photos" } });
});
it("keeps late unsaved drafts open when the final local save barrier fails", async () => {
  const beforeRecovery = vi.fn(async () => true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const f = await setup(beforeRecovery);
  fireEvent.click(screen.getByRole("button", { name: "Keep a copy and load cloud version" }));
  await screen.findByRole("button", { name: "Open recovery copy" });
  await waitFor(() => expect(beforeRecovery).toHaveBeenCalledTimes(2));
  expect(f.onReloadCloud).not.toHaveBeenCalled();
});
