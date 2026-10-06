// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameId, PhotoId, ProjectId, WorktableDraft } from "../contracts";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { frameTemplateSource } from "../modules/worktable/frameLayout";
import { App } from "./App";

const projectId = "connector-project" as ProjectId, photoId = "photo" as PhotoId, frameId = "frame" as FrameId;
beforeEach(() => {
  window.location.hash = `#/projects/${projectId}/table`;
  window.localStorage.setItem("photoflex:locale", "en");
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() }, releasePointerCapture: { configurable: true, value: vi.fn() }, hasPointerCapture: { configurable: true, value: () => true },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 20, top: 30, width: 1000, height: 700, right: 1020, bottom: 730, x: 20, y: 30, toJSON() {} }) },
  });
});
afterEach(cleanup);

async function fixture(zoom = 1) {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Connectors", createdAt: "2026-10-06T00:00:00Z" });
  if (!created.ok) throw Error("Project fixture failed");
  const draft: WorktableDraft = { ...created.value.worktableDraft, entryOrder: [photoId], placements: {
    [photoId]: { photoId, filename: "photo.jpg", x: 100, y: 100, width: 200, height: 100, z: 2 },
  }, memos: [{ id: "memo", text: "Memo", x: 500, y: 100, width: 160, height: 100, z: 3, fontSize: 16, photoIds: [] }],
    frameOrder: [frameId], frames: { [frameId]: { id: frameId, name: "Frame", x: 800, y: 100, z: 0, displayScale: .5,
      page: { widthPt: 400, heightPt: 600, templateSource: frameTemplateSource("single"), slots: [] } } } };
  await projectStore.saveWorkspace({ ...created.value, worktableDraft: draft, resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom } } }, created.value.revision);
  const photoSource = new MemoryPhotoSource([]);
  return { projectStore, photoSource };
}
function drag(stage: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, startElement: Element = stage) {
  fireEvent.pointerDown(startElement, { button: 0, clientX: from.x + 20, clientY: from.y + 30 });
  fireEvent.pointerMove(stage, { clientX: to.x + 20, clientY: to.y + 30 });
  fireEvent.pointerUp(stage, { clientX: to.x + 20, clientY: to.y + 30 });
}
async function savedDraft(store: MemoryProjectStore) {
  const result = await store.loadWorkspace(projectId);
  if (!result.ok) throw Error("Project missing");
  return result.value.worktableDraft;
}

describe("Table connector interaction", () => {
  it("activates without a selection, draws free lines, and restores saved lines after reopening", async () => {
    const dependencies = await fixture(), view = render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable"), button = screen.getByRole("button", { name: "Draw line" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(stage.classList.contains("is-connecting")).toBe(true);
    drag(stage, { x: -30, y: 300 }, { x: 300, y: 300 });
    await waitFor(async () => expect((await savedDraft(dependencies.projectStore)).connectors).toHaveLength(1));
    expect((await savedDraft(dependencies.projectStore)).connectors![0]).toMatchObject({ start: { x: -30, y: 300 }, end: { x: 300, y: 300 } });
    view.unmount(); render(<App dependencies={dependencies} />);
    const restored = await screen.findByLabelText("Photo worktable");
    expect(restored.querySelectorAll("[data-worktable-connector-id]")).toHaveLength(1);
  });

  it("draws from a photo to Memo text and a Frame without moving or editing either object", async () => {
    const dependencies = await fixture(); render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.click(screen.getByRole("button", { name: "Draw line" }));
    drag(stage, { x: 200, y: 150 }, { x: 580, y: 150 }, screen.getByLabelText("photo.jpg"));
    drag(stage, { x: 580, y: 150 }, { x: 900, y: 200 }, screen.getByLabelText("Memo text"));
    await waitFor(async () => expect((await savedDraft(dependencies.projectStore)).connectors).toHaveLength(2));
    const draft = await savedDraft(dependencies.projectStore);
    expect(draft.connectors![0]).toMatchObject({ start: { binding: { kind: "photo", id: photoId } }, end: { binding: { kind: "memo", id: "memo" } } });
    expect(draft.connectors![1]).toMatchObject({ start: { binding: { kind: "memo", id: "memo" } }, end: { binding: { kind: "frame", id: frameId } } });
    expect(draft.placements[photoId]).toMatchObject({ x: 100, y: 100 });
    expect((screen.getByLabelText("Memo text") as HTMLTextAreaElement).value).toBe("Memo");
  });

  it("selects a line, deletes it, and supports undo and redo", async () => {
    render(<App dependencies={await fixture()} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.keyDown(stage, { key: "l" }); drag(stage, { x: 100, y: 300 }, { x: 500, y: 300 });
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.pointerDown(stage.querySelector(".worktable-connector-hit")!, { button: 0 });
    fireEvent.keyDown(stage, { key: "Delete" });
    expect(stage.querySelectorAll("[data-worktable-connector-id]")).toHaveLength(0);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true });
    expect(stage.querySelectorAll("[data-worktable-connector-id]")).toHaveLength(1);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true, shiftKey: true });
    expect(stage.querySelectorAll("[data-worktable-connector-id]")).toHaveLength(0);
  });

  it("uses world coordinates at zoom and cancels unfinished or tiny gestures", async () => {
    const dependencies = await fixture(.5); render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.keyDown(stage, { key: "l" });
    drag(stage, { x: 100, y: 75 }, { x: 290, y: 75 }, screen.getByLabelText("photo.jpg"));
    await waitFor(async () => expect((await savedDraft(dependencies.projectStore)).connectors).toHaveLength(1));
    expect((await savedDraft(dependencies.projectStore)).connectors![0]).toMatchObject({ start: { x: 300, y: 150 }, end: { x: 500, y: 150 } });
    drag(stage, { x: 100, y: 300 }, { x: 102, y: 300 });
    fireEvent.pointerDown(stage, { button: 0, clientX: 120, clientY: 330 });
    fireEvent.pointerMove(stage, { clientX: 500, clientY: 330 });
    expect(stage.querySelector(".worktable-connector-preview line")).toBeTruthy();
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 330 });
    expect(stage.querySelector(".worktable-connector-preview")).toBeNull();
    expect(stage.querySelectorAll("[data-worktable-connector-id]")).toHaveLength(1);
    expect(stage.classList.contains("is-connecting")).toBe(false);
  });
});
