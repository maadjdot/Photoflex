// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LayoutId, LayoutPageId } from "../contracts";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { backupBytes } from "../../tests/helpers/projectBackup";
import { createEmptyLayout } from "../modules/layout/layoutDocument";
import { createProjectWriteCoordinator } from "./projectWriteCoordinator";
import { LayoutWorkspace } from "./LayoutWorkspace";
import { exportLayoutPdf, preflightLayoutPdf } from "../platform/browser/exportLayoutPdf";

vi.mock("../platform/browser/exportLayoutPdf", () => ({ exportLayoutPdf: vi.fn(), preflightLayoutPdf: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(preflightLayoutPdf).mockReset(); vi.mocked(exportLayoutPdf).mockReset(); });
it("keeps two-finger scrolling separate from smooth pinch zoom in the Layout editor", async () => {
  const projectStore = new MemoryProjectStore(), imported = await projectStore.importBackup(backupBytes());
  if (!imported.ok) throw Error("fixture import failed");
  const dependencies = { projectStore, photoSource: new MemoryPhotoSource() };
  const persistence = createProjectWriteCoordinator(dependencies, imported.value); await persistence.load();
  const sequences = await persistence.listSequences(); if (!sequences.ok) throw Error("fixture sequence missing");
  const layout = createEmptyLayout({ id: "trackpad-layout" as LayoutId, projectId: imported.value, sequenceId: sequences.value[0].id,
    pageId: "trackpad-page" as LayoutPageId, name: "Trackpad", createdAt: "2026-10-27" });
  await persistence.createLayout(layout);
  const view = render(<LayoutWorkspace dependencies={dependencies} persistence={persistence} projectId={imported.value} sequenceId={layout.sequenceId} layoutId={layout.id} navigate={vi.fn()} />);
  await screen.findByRole("button", { name: "Fit page" });
  const stage = view.container.querySelector<HTMLElement>(".layout-stage")!;
  const spread = stage.querySelector<HTMLElement>(".layout-spread")!;
  const originalWidth = spread.style.width;
  expect(fireEvent.wheel(stage, { deltaX: 40, deltaY: -30 })).toBe(true);
  expect(spread.style.width).toBe(originalWidth);
  for (let index = 0; index < 10; index++) expect(fireEvent.wheel(stage, { ctrlKey: true, deltaY: -.5 })).toBe(false);
  expect(parseFloat(spread.style.width)).toBeGreaterThan(parseFloat(originalWidth));
  expect(fireEvent.wheel(stage, { metaKey: true, deltaY: 100 })).toBe(false);
  expect(parseFloat(spread.style.width)).toBeLessThan(parseFloat(originalWidth));
  view.unmount(); persistence.dispose();
});

it("bounds Layout undo steps while preserving the last 100 page edits and redo", async () => {
  const projectStore = new MemoryProjectStore(), imported = await projectStore.importBackup(backupBytes()); if (!imported.ok) throw Error("fixture failed");
  const dependencies = { projectStore, photoSource: new MemoryPhotoSource() }, persistence = createProjectWriteCoordinator(dependencies, imported.value); await persistence.load();
  const sequences = await persistence.listSequences(); if (!sequences.ok) throw Error("missing sequence");
  const layout = createEmptyLayout({ id: "history-layout" as LayoutId, projectId: imported.value, sequenceId: sequences.value[0].id,
    pageId: "history-page" as LayoutPageId, name: "History", createdAt: "2026-10-07" });
  await persistence.createLayout(layout);
  const view = render(<LayoutWorkspace dependencies={dependencies} persistence={persistence} projectId={imported.value} sequenceId={layout.sequenceId} layoutId={layout.id} navigate={vi.fn()} />);
  const add = await screen.findByRole("button", { name: "+ Blank page" });
  for (let edit = 0; edit < 120; edit++) fireEvent.click(add);
  const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
  for (let edit = 0; edit < 100; edit++) { expect(undo.disabled).toBe(false); fireEvent.click(undo); }
  expect(undo.disabled).toBe(true);
  const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;
  fireEvent.click(redo);
  const addAgain = screen.getByRole("button", { name: "+ Blank page" }); fireEvent.click(addAgain);
  expect(redo.disabled).toBe(true);
  await persistence.flushAll();
  expect(await persistence.loadLayout(layout.id)).toMatchObject({ ok: true, value: { pages: expect.any(Array) } });
  const saved = await persistence.loadLayout(layout.id); expect(saved.ok && saved.value.pages.length).toBe(23);
  view.unmount(); persistence.dispose();
}, 15_000); // The 220 rendered history operations can exceed 5 seconds on shared CI runners.
it("cancels an in-progress export when the Layout workspace unmounts", async () => {
  const projectStore = new MemoryProjectStore(), imported = await projectStore.importBackup(backupBytes());
  if (!imported.ok) throw Error("fixture import failed");
  const dependencies = { projectStore, photoSource: new MemoryPhotoSource() };
  const persistence = createProjectWriteCoordinator(dependencies, imported.value); await persistence.load();
  const sequences = await persistence.listSequences(); if (!sequences.ok) throw Error("fixture sequence missing");
  const layout = createEmptyLayout({ id: "export-layout" as LayoutId, projectId: imported.value, sequenceId: sequences.value[0].id,
    pageId: "export-page" as LayoutPageId, name: "Export", createdAt: "2026-10-07" });
  expect((await persistence.createLayout(layout)).ok).toBe(true);
  let signal: AbortSignal | undefined;
  vi.mocked(preflightLayoutPdf).mockImplementation(async (_snapshot, _source, currentSignal) => {
    signal = currentSignal;
    await new Promise<void>((resolve) => currentSignal!.addEventListener("abort", () => resolve(), { once: true }));
    return { blocking: [], warnings: [] };
  });
  const view = render(<LayoutWorkspace dependencies={dependencies} persistence={persistence} projectId={imported.value} sequenceId={layout.sequenceId} layoutId={layout.id} navigate={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Export PDF$/ }));
  expect(preflightLayoutPdf).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  fireEvent.submit(dialog.querySelector("form")!);
  await waitFor(() => expect(preflightLayoutPdf).toHaveBeenCalledOnce());
  view.unmount();
  expect(signal?.aborted).toBe(true);
  expect(exportLayoutPdf).not.toHaveBeenCalled();
  persistence.dispose();
});
