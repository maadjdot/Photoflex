// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, WorktableDraft } from "../contracts";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { App } from "./App";

const projectId = "turn-photo-project" as ProjectId;
const photoA = "photo-a" as PhotoId, photoB = "photo-b" as PhotoId;
beforeEach(() => {
  window.location.hash = `#/projects/${projectId}/table`;
  window.localStorage.setItem("photoflex:locale", "en");
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() }, releasePointerCapture: { configurable: true, value: vi.fn() }, hasPointerCapture: { configurable: true, value: () => true },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON() {} }) },
  });
});
afterEach(cleanup);

async function fixture() {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Turn photos", createdAt: "2026-10-13T00:00:00Z" });
  if (!created.ok) throw Error("Project fixture failed");
  const draft: WorktableDraft = { ...created.value.worktableDraft, entryOrder: [photoA, photoB], placements: {
    [photoA]: { photoId: photoA, filename: "A.jpg", x: 100, y: 100, width: 200, height: 150, z: 1 },
    [photoB]: { photoId: photoB, filename: "B.jpg", x: 350, y: 100, width: 150, height: 200, z: 2 },
  } };
  await projectStore.saveWorkspace({ ...created.value, worktableDraft: draft, resumeContext: { page: "table", filter: "all", tableViewport: { originX: 0, originY: 0, zoom: 1 } } }, created.value.revision);
  return { projectStore, photoSource: new MemoryPhotoSource([]) };
}
async function savedDraft(store: MemoryProjectStore) {
  const result = await store.loadWorkspace(projectId);
  if (!result.ok) throw Error("Project missing");
  return result.value.worktableDraft;
}
function clickPhoto(card: Element) {
  fireEvent.pointerDown(card, { button: 0, clientX: 150, clientY: 150 });
  fireEvent.pointerUp(card, { button: 0, clientX: 150, clientY: 150 });
  fireEvent.click(card);
}

describe("Table photo turn tool", () => {
  it("turns several photos and the same photo repeatedly, without selecting, moving or opening them", async () => {
    const dependencies = await fixture(); render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable"), button = screen.getByRole("button", { name: "Turn photo" });
    const a = stage.querySelector(`[data-worktable-photo-id='${photoA}']`)!, b = stage.querySelector(`[data-worktable-photo-id='${photoB}']`)!;
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(stage.classList.contains("is-turning-photos")).toBe(true);
    clickPhoto(a); clickPhoto(b);
    expect(a.classList.contains("is-face-down")).toBe(true);
    expect(b.classList.contains("is-face-down")).toBe(true);
    expect(a.classList.contains("is-selected")).toBe(false);
    expect(stage.querySelector(".worktable-photo-back")?.textContent).toBe("");
    fireEvent.doubleClick(a);
    expect(screen.queryByRole("dialog")).toBeNull();
    clickPhoto(a);
    expect(a.classList.contains("is-face-down")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await waitFor(async () => {
      const saved = await savedDraft(dependencies.projectStore);
      expect(saved.placements[photoA]).toMatchObject({ x: 100, y: 100, faceDown: false });
      expect(saved.placements[photoB]).toMatchObject({ x: 350, y: 100, faceDown: true });
    });
  });

  it.each(["blank", "tool", "Escape"])("exits through %s and restores ordinary photo selection", async (exit) => {
    render(<App dependencies={await fixture()} />);
    const stage = await screen.findByLabelText("Photo worktable"), button = screen.getByRole("button", { name: "Turn photo" });
    fireEvent.click(button);
    if (exit === "blank") { fireEvent.pointerDown(stage, { button: 0 }); fireEvent.pointerUp(stage); fireEvent.click(stage); }
    else if (exit === "tool") fireEvent.click(button);
    else fireEvent.keyDown(stage, { key: "Escape" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(stage.classList.contains("is-turning-photos")).toBe(false);
    expect(stage.querySelector(".worktable-turn-photo-hint")).toBeNull();
    const card = stage.querySelector(`[data-worktable-photo-id='${photoA}']`)!;
    clickPhoto(card);
    expect(card.classList.contains("is-selected")).toBe(true);
    expect(card.classList.contains("is-face-down")).toBe(false);
  });

  it("switches exclusively between turn and line tools and exits when another left tool is used", async () => {
    render(<App dependencies={await fixture()} />);
    const stage = await screen.findByLabelText("Photo worktable"), turn = screen.getByRole("button", { name: "Turn photo" }), line = screen.getByRole("button", { name: "Draw line" });
    fireEvent.click(line); fireEvent.click(turn);
    expect(line.getAttribute("aria-pressed")).toBe("false");
    expect(stage.classList.contains("is-connecting")).toBe(false);
    fireEvent.click(line);
    expect(turn.getAttribute("aria-pressed")).toBe("false");
    expect(stage.classList.contains("is-connecting")).toBe(true);
    fireEvent.click(turn); fireEvent.click(screen.getByRole("button", { name: "Add memo" }));
    expect(turn.getAttribute("aria-pressed")).toBe("false");
  });

  it("supports undo and redo and restores saved orientation after reopening, with the tool initially off", async () => {
    const dependencies = await fixture(), view = render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable"), card = stage.querySelector(`[data-worktable-photo-id='${photoA}']`)!;
    fireEvent.click(screen.getByRole("button", { name: "Turn photo" })); clickPhoto(card);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true });
    expect(card.classList.contains("is-face-down")).toBe(false);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true, shiftKey: true });
    expect(card.classList.contains("is-face-down")).toBe(true);
    await waitFor(async () => expect((await savedDraft(dependencies.projectStore)).placements[photoA].faceDown).toBe(true));
    view.unmount(); render(<App dependencies={dependencies} />);
    const restored = await screen.findByLabelText("Photo worktable");
    expect(restored.querySelector(`[data-worktable-photo-id='${photoA}']`)?.classList.contains("is-face-down")).toBe(true);
    expect(screen.getByRole("button", { name: "Turn photo" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("restores a mixed selection without turning front-facing photos over, with undo and redo", async () => {
    const dependencies = await fixture(); render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable"), a = stage.querySelector(`[data-worktable-photo-id='${photoA}']`)!, b = stage.querySelector(`[data-worktable-photo-id='${photoB}']`)!;
    fireEvent.click(screen.getByRole("button", { name: "Turn photo" })); clickPhoto(a);
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    const restore = screen.getByRole("button", { name: "Turn face up" }), filter = screen.getByRole("button", { name: "Filter" });
    expect(restore.hasAttribute("disabled")).toBe(false);
    expect(filter.hasAttribute("disabled")).toBe(false);
    fireEvent.click(restore);
    expect(a.classList.contains("is-face-down")).toBe(false);
    expect(b.classList.contains("is-face-down")).toBe(false);
    expect(restore.hasAttribute("disabled")).toBe(true);
    expect(filter.hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true });
    expect(a.classList.contains("is-face-down")).toBe(true);
    expect(b.classList.contains("is-face-down")).toBe(false);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true, shiftKey: true });
    expect(a.classList.contains("is-face-down")).toBe(false);
    await waitFor(async () => {
      const saved = await savedDraft(dependencies.projectStore);
      expect(saved.placements[photoA].faceDown).toBe(false);
      expect(saved.placements[photoB].faceDown).toBeUndefined();
    });
  });

  it("classifies a mixed selection into two saved groups, including single-photo categories", async () => {
    const dependencies = await fixture(), view = render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable"), a = stage.querySelector(`[data-worktable-photo-id='${photoA}']`)!;
    fireEvent.click(screen.getByRole("button", { name: "Turn photo" })); clickPhoto(a);
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(stage.querySelectorAll(".worktable-group-frame")).toHaveLength(2);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true });
    expect(stage.querySelectorAll(".worktable-group-frame")).toHaveLength(0);
    fireEvent.keyDown(stage, { key: "z", ctrlKey: true, shiftKey: true });
    await waitFor(async () => {
      const saved = await savedDraft(dependencies.projectStore);
      expect(saved.groups).toEqual([
        { id: "group-1", name: "Face-up photos", photoIds: [photoB] },
        { id: "group-2", name: "Face-down photos", photoIds: [photoA] },
      ]);
      expect(saved.placements[photoA].faceDown).toBe(true);
      expect(saved.placements[photoB].faceDown).toBeUndefined();
      expect(saved.placements[photoA].x).toBeGreaterThan(saved.placements[photoB].x + saved.placements[photoB].width);
    });
    view.unmount(); render(<App dependencies={dependencies} />);
    const restored = await screen.findByLabelText("Photo worktable");
    expect(restored.querySelectorAll(".worktable-group-frame")).toHaveLength(2);
    expect(restored.querySelector("[data-worktable-photo-id='photo-a']")?.classList.contains("is-face-down")).toBe(true);
  });

  it("uses the simplified Chinese hint without the removed text", async () => {
    window.localStorage.setItem("photoflex:locale", "zh-CN");
    render(<App dependencies={await fixture()} />);
    await screen.findByLabelText("照片工作台");
    fireEvent.click(screen.getByRole("button", { name: "翻面工具" }));
    expect(document.querySelector(".worktable-turn-photo-hint")?.textContent).toContain("点击照片翻转");
    expect(document.querySelector(".worktable-turn-photo-hint")?.textContent).not.toContain("可连续操作");
  });
});
