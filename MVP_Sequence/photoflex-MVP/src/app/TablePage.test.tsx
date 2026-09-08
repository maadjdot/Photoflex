// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type PhotoId, type ProjectId, type ReadingUnitId, type SequenceDocument, type SequenceId, type SequenceItemId, type SequenceVersion, type SourceId, type VersionId } from "../contracts";
import { createWorktableEditor } from "../modules/worktable";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

const projectId = "table-project" as ProjectId;
const sourceId = "table-source" as SourceId;
const photoA = "photo-a" as PhotoId;
const photoB = "photo-b" as PhotoId;

async function createFixture() {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({
    id: projectId,
    name: "Table Project",
    createdAt: "2026-08-31T08:00:00.000Z",
    initialSource: { id: sourceId, displayName: "Selects", createdAt: "2026-08-31T08:00:00.000Z" },
  });
  if (!created.ok) throw new Error("fixture project not created");
  const editor = createWorktableEditor(created.value.worktableDraft);
  const result = editor.execute({
    type: "place",
    items: [
      { photoId: photoA, width: 196, height: 146, filename: "A.jpg" },
      { photoId: photoB, width: 146, height: 196, filename: "B.jpg" },
    ],
  });
  if (!result.ok) throw new Error("fixture table not created");
  await projectStore.saveWorkspace({ ...created.value, worktableDraft: result.value }, created.value.revision);
  const photoSource = new MemoryPhotoSource([{
    grant: { sourceId, displayName: "Selects", status: "ready", restored: true },
    photos: [
      { id: photoA, sourceId, relativePath: "A.jpg", width: 1200, height: 900 },
      { id: photoB, sourceId, relativePath: "B.jpg", width: 900, height: 1200 },
    ],
    previewUrls: { [photoA]: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", [photoB]: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
  }]);
  return { projectStore, photoSource };
}

async function createPileFixture() {
  const fixture = await createFixture();
  const workspace = await fixture.projectStore.loadWorkspace(projectId);
  if (!workspace.ok) throw new Error("fixture workspace not loaded");
  const sequenceId = "sequence-deletable" as SequenceId;
  const versionId = "version-deletable" as VersionId;
  const itemId = "item-deletable" as SequenceItemId;
  const now = "2026-08-31T08:00:00.000Z";
  const items = [{ id: itemId, kind: "photo" as const, photoId: photoA }];
  const readingUnits = [{ id: "unit-deletable" as ReadingUnitId, kind: "single" as const, itemId }];
  const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Sequence 01", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: now, updatedAt: now };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial · Sequence 01", itemCount: 1, items, segments: [], readingUnits, createdAt: now };
  const editor = createWorktableEditor(workspace.value.worktableDraft);
  const placed = editor.execute({ type: "place-sequence-pile", placement: { sequenceId, x: 180, y: 120, z: 2, width: 211, height: 142 } });
  if (!placed.ok) throw new Error("fixture pile not created");
  const created = await fixture.projectStore.createSequence(projectId, workspace.value.revision, sequence, version, placed.value);
  if (!created.ok) throw new Error("fixture sequence not created");
  return { ...fixture, sequenceId, sequence };
}

describe("TablePage", () => {
  beforeEach(() => {
    window.location.hash = `#/projects/${projectId}/table`;
    if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { value: MouseEvent });
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    });
    // jsdom has no layout, so every element measures 0×0. A zero-size stage would
    // cull every thumbnail; give it a measurable box so culling keeps cards alive.
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON() {} }),
    });
  });

  afterEach(() => cleanup());

  it("渲染独立 Table 路由与基础工具栏", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);

    expect(await screen.findByLabelText("Photo worktable")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
    expect(screen.getByRole("button", { name: "返回 Home" }).textContent).toBe("Photoflex");
    const cardA = screen.getByLabelText("A.jpg");
    expect(cardA).toBeTruthy();
    expect(screen.getByLabelText("B.jpg")).toBeTruthy();
    expect(screen.queryByText("A.jpg")).toBeNull();
    const toolbar = within(screen.getByLabelText("Table 工具栏"));
    expect(toolbar.queryByRole("button", { name: "Contact Sheet" })).toBeNull();
    expect(within(screen.getByRole("button", { name: "返回 Home" }).closest("header")!).getByText("Table Project")).toBeTruthy();
    expect(toolbar.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hand" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Table selection actions" })).toBeNull();
    expect(screen.getByRole("group", { name: "Table arrangement tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move toolbar vertically" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /登录/ })).toBeNull();
    expect(screen.queryByText(/Juxtapose/)).toBeNull();

    fireEvent.doubleClick(cardA);
    expect(await screen.findByRole("dialog", { name: "Preview A.jpg" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Preview A.jpg" }).querySelector(".table-preview-image-wrap")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));

    const contactSheet = screen.getByRole("button", { name: /Contact Sheet/ });
    fireEvent.click(contactSheet);
    await waitFor(() => expect(window.location.hash).toBe(`#/projects/${projectId}/sources/${sourceId}`));
  });

  it("选中操作栏保持单行、使用精简文案且不显示 Clear", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    const toolbar = within(screen.getByRole("group", { name: "Table selection actions" }));
    expect(toolbar.getByText("2 photos")).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Create Sequence" }).textContent).toContain("Sequence");
    expect(toolbar.queryByRole("button", { name: "Clear" })).toBeNull();
    fireEvent.click(toolbar.getByRole("button", { name: "Link" }));
    expect(toolbar.getByRole("button", { name: "Unlink" })).toBeTruthy();
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(1);
    fireEvent.click(toolbar.getByRole("button", { name: "Unlink" }));
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(0);
    fireEvent.click(toolbar.getByRole("button", { name: "Group" }));
    expect(toolbar.getByRole("button", { name: "Ungroup" })).toBeTruthy();
    fireEvent.click(toolbar.getByRole("button", { name: "Ungroup" }));
    expect(toolbar.queryByText("More")).toBeNull();
    fireEvent.click(toolbar.getByRole("button", { name: "Front" }));
    expect(toolbar.getByText("2 photos")).toBeTruthy();
    expect(screen.getByLabelText("A.jpg")).toBeTruthy();
    expect(screen.getByLabelText("B.jpg")).toBeTruthy();
  });

  it("创建 Sequence 时按 Table 的从左到右、从上到下空间顺序排列", async () => {
    const dependencies = await createFixture();
    const loaded = await dependencies.projectStore.loadWorkspace(projectId);
    if (!loaded.ok) throw new Error("fixture workspace not loaded");
    const positioned = {
      ...loaded.value,
      worktableDraft: {
        ...loaded.value.worktableDraft,
        placements: {
          ...loaded.value.worktableDraft.placements,
          [photoA]: { ...loaded.value.worktableDraft.placements[photoA], x: 420, y: 310 },
          [photoB]: { ...loaded.value.worktableDraft.placements[photoB], x: 70, y: 50 },
        },
      },
    };
    const saved = await dependencies.projectStore.saveWorkspace(positioned, loaded.value.revision);
    if (!saved.ok) throw new Error("fixture positions not saved");

    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Create Sequence" }));

    const dialog = await screen.findByRole("dialog", { name: "Create Sequence pile" });
    expect(within(dialog).getByAltText("Order 1: B.jpg")).toBeTruthy();
    expect(within(dialog).getByAltText("Order 2: A.jpg")).toBeTruthy();
  });

  it("单选组内照片即可解除分组和链接，并可撤销", async () => {
    render(<App dependencies={await createFixture()} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.keyDown(stage, { key: "g" });
    fireEvent.keyDown(stage, { key: "l" });
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.pointerDown(screen.getByLabelText("A.jpg"), { pointerId: 31, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerId: 31, clientX: 100, clientY: 100 });
    expect(screen.getByText("1 photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave Group" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(stage.querySelectorAll(".worktable-group-frame")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(stage.querySelectorAll(".worktable-group-frame")).toHaveLength(1);
    fireEvent.keyDown(stage, { key: "G", shiftKey: true });
    fireEvent.keyDown(stage, { key: "L", shiftKey: true });
    expect(stage.querySelectorAll(".worktable-group-frame")).toHaveLength(0);
    expect(stage.querySelectorAll(".worktable-links line")).toHaveLength(0);
  });

  it("removes and reconnects a source without deleting existing photo references", async () => {
    const dependencies = await createPileFixture();
    render(<App dependencies={dependencies} />);
    await screen.findByLabelText("Photo worktable");
    fireEvent.click(screen.getByRole("button", { name: "Manage photo sources" }));
    const manager = screen.getByRole("dialog", { name: "Manage photo sources" });
    fireEvent.click(within(manager).getByRole("button", { name: "Remove source" }));
    await within(manager).findByRole("button", { name: "Reconnect" });
    const removed = await dependencies.projectStore.loadWorkspace(projectId);
    if (!removed.ok) throw new Error("missing workspace");
    expect(removed.value.sources[0].removedAt).toBeTruthy();
    expect(removed.value.worktableDraft.entryOrder).toContain(photoA);
    expect(removed.value.sequenceIds).toContain(dependencies.sequenceId);
    expect((await dependencies.photoSource.getPhoto(photoA)).ok).toBe(true);
    fireEvent.click(within(manager).getByRole("button", { name: "Reconnect" }));
    await within(manager).findByRole("button", { name: "Remove source" });
    const restored = await dependencies.projectStore.loadWorkspace(projectId);
    expect(restored.ok && restored.value.sources[0].removedAt).toBeUndefined();
  });

  it("keeps header controls together and restores fully hidden panels", async () => {
    render(<App dependencies={await createPileFixture()} />);
    await screen.findByLabelText("Photo worktable");
    const header = screen.getByRole("button", { name: "返回 Home" }).closest("header")!;
    for (const name of ["Undo", "Redo", "Zoom in", "Zoom out", "Hide Photo Sources"]) {
      expect(within(header).getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Shortcuts" })).toBeNull();
    fireEvent.click(within(header).getByRole("button", { name: "Hide Photo Sources" }));
    expect(screen.queryByRole("complementary", { name: "Photo Sources" })).toBeNull();
    fireEvent.click(within(header).getByRole("button", { name: "Open Photo Sources" }));
    expect(screen.getByRole("complementary", { name: "Photo Sources" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Sequence Order" })).toBeNull();
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    fireEvent.pointerDown(pile, { button: 0 });
    fireEvent.pointerUp(pile, { button: 0 });
    expect(screen.getByRole("region", { name: "Sequence Order" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Sequence Order" }));
    expect(screen.queryByRole("region", { name: "Sequence Order" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show Sequence Order" })).toBeNull();
    fireEvent.pointerDown(pile, { button: 0 });
    fireEvent.pointerUp(pile, { button: 0 });
    expect(screen.getByRole("region", { name: "Sequence Order" })).toBeTruthy();
  });

  it("一次拖拽只提交一次桌面写入且不改变 Sequence", async () => {
    const dependencies = await createFixture();
    const saveSpy = vi.spyOn(dependencies.projectStore, "saveWorkspace");
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const card = screen.getByLabelText("A.jpg");
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON() {} }),
    });
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    saveSpy.mockClear();

    fireEvent.pointerDown(card, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 120, clientY: 115 });
    expect(card.className).toContain("is-dragging");
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 145, clientY: 130 });
    fireEvent.pointerUp(stage, { pointerId: 7, clientX: 145, clientY: 130 });
    expect(card.className).not.toContain("is-dragging");

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const saved = await dependencies.projectStore.loadWorkspace(projectId);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.worktableDraft.placements[photoA].x).toBe(109);
    expect(saved.value.worktableDraft.placements[photoA].y).toBe(94);
    expect(saved.value.sequenceIds).toEqual([]);
  });

  it("取消中的桌面手势只丢弃预览，不提交编辑", async () => {
    const dependencies = await createFixture();
    const saveSpy = vi.spyOn(dependencies.projectStore, "saveWorktable");
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const card = screen.getByLabelText("A.jpg");
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON() {} }),
    });

    fireEvent.pointerDown(card, { pointerId: 11, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 11, clientX: 150, clientY: 130 });
    fireEvent.pointerCancel(stage, { pointerId: 11, clientX: 150, clientY: 130 });

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(saveSpy).not.toHaveBeenCalled();
    const workspace = await dependencies.projectStore.loadWorkspace(projectId);
    expect(workspace.ok).toBe(true);
    if (!workspace.ok) return;
    expect(workspace.value.worktableDraft.placements[photoA].x).toBe(64);
    expect(workspace.value.worktableDraft.placements[photoA].y).toBe(64);
  });

  it("Table 先使用 768px 派生图，选中后渐进替换为更高清版本，双击才读取原图", async () => {
    const dependencies = await createFixture();
    const derivedPreview = vi.spyOn(dependencies.photoSource, "derivedPreview").mockImplementation(async (photoId) => ok({
      url: `table:${photoId}`,
      release() {},
    }));
    const preview = vi.spyOn(dependencies.photoSource, "preview").mockImplementation(async (photoId) => ok({
      url: `preview:${photoId}`,
      release() {},
    }));

    render(<App dependencies={dependencies} />);
    const card = await screen.findByLabelText("A.jpg");
    await waitFor(() => expect(derivedPreview).toHaveBeenCalledWith(photoA, 768));
    expect(preview).not.toHaveBeenCalled();

    fireEvent.pointerDown(card, { pointerId: 9, button: 0, clientX: 100, clientY: 100 });
    await waitFor(() => expect(derivedPreview).toHaveBeenCalledWith(photoA, 1536));

    fireEvent.doubleClick(card);
    await waitFor(() => expect(preview).toHaveBeenCalledWith(photoA));
  });

  it("Table 不挂载远离视口的照片卡片", async () => {
    const dependencies = await createFixture();
    const loaded = await dependencies.projectStore.loadWorkspace(projectId);
    if (!loaded.ok) throw new Error("fixture workspace not loaded");
    const moved = {
      ...loaded.value,
      worktableDraft: {
        ...loaded.value.worktableDraft,
        placements: {
          ...loaded.value.worktableDraft.placements,
          [photoB]: { ...loaded.value.worktableDraft.placements[photoB], x: 5_000, y: 5_000 },
        },
      },
    };
    const saved = await dependencies.projectStore.saveWorkspace(moved, loaded.value.revision);
    expect(saved.ok).toBe(true);

    render(<App dependencies={dependencies} />);
    expect(await screen.findByLabelText("A.jpg")).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("B.jpg")).toBeNull());
  });

  it("后台保存失败时保留编辑并显示具体原因", async () => {
    const dependencies = await createFixture();
    vi.spyOn(dependencies.projectStore, "saveWorktable").mockResolvedValue(err({ kind: "quota-exceeded" }));
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const card = screen.getByLabelText("A.jpg");

    fireEvent.pointerDown(card, { pointerId: 8, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 8, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(stage, { pointerId: 8, clientX: 140, clientY: 120 });

    expect(await screen.findByText("浏览器存储空间不足，当前状态未覆盖。")).toBeTruthy();
    expect(screen.getByLabelText("A.jpg")).toBeTruthy();
  });

  it("删除 Table Sequence pile 会删除 Sequence，名称可复用且不能继续写入旧 Sequence", async () => {
    const { projectStore, photoSource, sequenceId, sequence } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);

    const pile = await screen.findByLabelText("Sequence pile Sequence 01");
    fireEvent.pointerDown(pile, { pointerId: 10, button: 0, clientX: 200, clientY: 150 });
    fireEvent.click(within(screen.getByLabelText("Table 工具栏")).getByRole("button", { name: "Delete Sequence" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Sequence?" })).getByRole("button", { name: "Delete Sequence" }));

    await waitFor(async () => {
      const listed = await projectStore.listSequences(projectId);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.value).toEqual([]);
    });
    expect((await projectStore.loadSequence(sequenceId)).ok).toBe(false);
    expect((await projectStore.saveSequence({ ...sequence, revision: 0 as SequenceDocument["revision"] }, 0 as SequenceDocument["revision"])).ok).toBe(false);

    const deletedWorkspace = await projectStore.loadWorkspace(projectId);
    if (!deletedWorkspace.ok) throw new Error("workspace missing after delete");
    const recreatedSequence = { ...sequence, currentVersionId: "version-recreated" as VersionId };
    const recreated = await projectStore.createSequence(projectId, deletedWorkspace.value.revision, recreatedSequence, { id: "version-recreated" as VersionId, projectId, sequenceId: sequence.id, name: "Initial · Sequence 01", itemCount: 1, items: sequence.items, segments: [], readingUnits: sequence.readingUnits, createdAt: sequence.createdAt }, deletedWorkspace.value.worktableDraft);
    expect(recreated.ok).toBe(true);
  });

  it("Add to Sequence 后实时刷新 Sequence Order，并可从底栏移除照片", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);

    const pile = await screen.findByLabelText("Sequence pile Sequence 01");
    fireEvent.pointerDown(pile, { button: 0 });
    fireEvent.pointerUp(pile, { button: 0 });
    await screen.findByText("Sequence 01 · 1 photos");
    const strip = screen.getByLabelText("Sequence Order");
    expect(within(strip).queryByText("A.jpg")).toBeNull();

    const cardB = screen.getByLabelText("B.jpg");
    fireEvent.pointerDown(cardB, { pointerId: 21, button: 0, clientX: 320, clientY: 160 });
    const selectionActions = screen.getByRole("group", { name: "Table selection actions" });
    fireEvent.click(within(selectionActions).getByRole("button", { name: "Add to Sequence" }));
    const addButton = await screen.findByRole("button", { name: "Add photos" });
    await waitFor(() => expect(addButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton);

    await waitFor(() => expect(within(screen.getByLabelText("Sequence Order")).getByText("Sequence 01 · 2 photos")).toBeTruthy());
    expect(within(screen.getByLabelText("Sequence Order")).queryByText("B.jpg")).toBeNull();
    fireEvent.click(within(screen.getByLabelText("Sequence Order")).getByRole("button", { name: "Remove item 2 from Sequence" }));
    expect(within(screen.getByLabelText("Sequence Order")).getByText("Sequence 01 · 1 photos")).toBeTruthy();

    await waitFor(async () => {
      const saved = await projectStore.loadSequence(sequenceId);
      expect(saved.ok).toBe(true);
      if (saved.ok) expect(saved.value.items.map((item) => item.kind === "photo" ? item.photoId : "blank")).toEqual([photoA]);
    });
  });

  it("Add to Sequence 保存失败时保留弹窗与未持久化提示", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    vi.spyOn(projectStore, "saveSequence").mockResolvedValue(err({ kind: "quota-exceeded" }));
    render(<App dependencies={{ projectStore, photoSource }} />);

    await screen.findByText("Sequence 01 · 1 photos");
    fireEvent.pointerDown(screen.getByLabelText("B.jpg"), { pointerId: 22, button: 0, clientX: 320, clientY: 160 });
    fireEvent.click(within(screen.getByRole("group", { name: "Table selection actions" })).getByRole("button", { name: "Add to Sequence" }));
    const addButton = await screen.findByRole("button", { name: "Add photos" });
    await waitFor(() => expect(addButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton);

    expect(await screen.findByText("Sequence save failed. Your edit remains on screen.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Add photos to Sequence" })).toBeTruthy();
    const saved = await projectStore.loadSequence(sequenceId);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.items).toHaveLength(1);
  });

  it("Add to Sequence 约束焦点、Escape 关闭并返回入口", async () => {
    const { projectStore, photoSource } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);

    await screen.findByText("Sequence 01 · 1 photos");
    fireEvent.pointerDown(screen.getByLabelText("B.jpg"), { pointerId: 23, button: 0, clientX: 320, clientY: 160 });
    const opener = within(screen.getByRole("group", { name: "Table selection actions" })).getByRole("button", { name: "Add to Sequence" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Add photos to Sequence" });
    const addButton = within(dialog).getByRole("button", { name: "Add photos" });
    addButton.focus();
    fireEvent.keyDown(addButton, { key: "Tab" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Add photos to Sequence" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

});
