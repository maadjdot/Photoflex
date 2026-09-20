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
  it("copies selected photos into independent Table instances", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");

    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.keyDown(stage, { key: "c", ctrlKey: true });
    fireEvent.keyDown(stage, { key: "v", ctrlKey: true });

    await waitFor(() => expect(screen.getAllByLabelText("A.jpg")).toHaveLength(2));
    const workspace = await dependencies.projectStore.loadWorkspace(projectId);
    expect(workspace.ok && workspace.value.worktableDraft.entryOrder).toHaveLength(4);
    if (!workspace.ok) return;
    expect(workspace.value.worktableDraft.entryOrder.map((id) => workspace.value.worktableDraft.placements[id].photoId))
      .toEqual([photoA, photoB, photoA, photoB]);
  });

  it("imports an OS-dropped JPEG and creates an External Imports source", async () => {
    const dependencies = await createFixture();
    const ingest = vi.spyOn(dependencies.photoSource, "ingestDroppedFiles");
    const saveWorktable = vi.spyOn(dependencies.projectStore, "saveWorktable");
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const handle = {
      kind: "file" as const,
      name: "outside.jpg",
      async getFile() { return new File(["photo"], "outside.jpg", { type: "image/jpeg" }); },
      async isSameEntry(other: FileSystemHandle) { return other === handle; },
    } as unknown as FileSystemFileHandle;
    const getAsFileSystemHandle = vi.fn(() => Promise.resolve(handle));

    fireEvent.drop(stage, {
      clientX: 400,
      clientY: 300,
      dataTransfer: { types: ["Files"], items: [{ getAsFileSystemHandle }], getData: () => "" },
    });

    expect(getAsFileSystemHandle).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    expect(await ingest.mock.results[0].value).toMatchObject({ ok: true, value: { items: [{ status: "created" }] } });
    await waitFor(() => expect(saveWorktable).toHaveBeenCalled());
    await waitFor(async () => {
      const workspace = await dependencies.projectStore.loadWorkspace(projectId);
      expect(workspace.ok && workspace.value.sources.some((source) => source.kind === "external-files")).toBe(true);
      expect(workspace.ok && workspace.value.worktableDraft.entryOrder).toHaveLength(3);
    });
    expect(await screen.findByLabelText("outside.jpg")).toBeTruthy();
  });

  it("keeps failed edits open when leaving and can save an independent recovery copy", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    vi.spyOn(dependencies.projectStore, "saveWorktable").mockResolvedValue(err({ kind: "quota-exceeded" }));
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    await screen.findByRole("button", { name: "Changes not saved · Retry" });
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    await screen.findByText("Your latest edits have not been saved.");
    expect(window.location.hash).toBe(`#/projects/${projectId}/table`);
    expect(screen.getByLabelText("Photo worktable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save recovery copy" }));
    await waitFor(() => expect(window.location.hash).not.toContain(projectId));
    const projects = await dependencies.projectStore.listProjects();
    expect(projects.ok && projects.value.length).toBe(2);
    if (!projects.ok) return;
    const copyId = projects.value.find((p) => p.id !== projectId)!.id;
    const copy = await dependencies.projectStore.loadWorkspace(copyId);
    const original = await dependencies.projectStore.loadWorkspace(projectId);
    expect(copy.ok && copy.value.worktableDraft.groups.length).toBe(1);
    expect(original.ok && original.value.worktableDraft.groups.length).toBe(0);
  });
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

  it("creates, formats, links and restores a saved memo", async () => {
    const dependencies = await createFixture();
    const view = render(<App dependencies={dependencies} />);
    await screen.findByLabelText("Photo worktable");
    fireEvent.click(screen.getByRole("button", { name: "Add memo" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Memo text" }), { target: { value: "Light and shadow" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Memo font size" }), { target: { value: "24" } });
    const card = screen.getByLabelText("A.jpg");
    fireEvent.pointerDown(card, { button: 0 });
    fireEvent.pointerUp(card, { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Link memo to selected photos" }));
    await waitFor(async () => {
      const result = await dependencies.projectStore.loadWorkspace(projectId);
      expect(result.ok && result.value.worktableDraft.memos?.[0]).toMatchObject({ text: "Light and shadow", fontSize: 24, photoIds: [photoA] });
    });
    view.unmount();
    render(<App dependencies={dependencies} />);
    const text = await screen.findByRole("textbox", { name: "Memo text" });
    expect((text as HTMLTextAreaElement).value).toBe("Light and shadow");
    expect(text.style.fontSize).toBe("24px");
    expect(document.querySelectorAll(".memo-links line")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete memo" }));
    expect(screen.queryByRole("textbox", { name: "Memo text" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect((screen.getByRole("textbox", { name: "Memo text" }) as HTMLTextAreaElement).value).toBe("Light and shadow");
  });

  it("渲染独立 Table 路由与基础工具栏", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);

    expect(await screen.findByLabelText("Photo worktable")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to Home" }).textContent).toBe("Photoflex");
    const cardA = screen.getByLabelText("A.jpg");
    expect(cardA).toBeTruthy();
    expect(screen.getByLabelText("B.jpg")).toBeTruthy();
    expect(screen.queryByText("A.jpg")).toBeNull();
    const toolbar = within(screen.getByLabelText("Table toolbar"));
    expect(toolbar.queryByRole("button", { name: "Contact Sheet" })).toBeNull();
    expect(within(screen.getByRole("button", { name: "Back to Home" }).closest("header")!).getByText("Table Project")).toBeTruthy();
    expect(toolbar.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hand" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Table selection actions" })).toBeNull();
    expect(screen.getByRole("group", { name: "Table arrangement tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move toolbar vertically" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /登录/ })).toBeNull();
    expect(screen.queryByText(/Juxtapose/)).toBeNull();

    fireEvent.doubleClick(cardA);
    const preview = await screen.findByRole("dialog", { name: "Preview A.jpg" });
    expect(preview.querySelector(".table-preview-image-wrap")).toBeTruthy();
    fireEvent.click(within(preview).getByRole("button", { name: "Zoom in" }));
    expect(within(preview).getByRole("button", { name: "Reset zoom" }).textContent).toBe("125%");
    expect(preview.querySelector(".table-preview-image-wrap")?.classList.contains("is-pannable")).toBe(true);
    fireEvent.click(within(preview).getByRole("button", { name: "Rotate right" }));
    expect(preview.querySelector(".table-photo-preview-image")?.getAttribute("data-rotation")).toBe("90");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));

  });

  it("用 Space 预览选中照片，用 C 打开比较", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const cardA = within(stage).getByLabelText("A.jpg");
    fireEvent.pointerDown(cardA, { pointerId: 31, button: 0, clientX: 120, clientY: 120 });
    fireEvent.pointerUp(cardA, { pointerId: 31, clientX: 120, clientY: 120 });
    fireEvent.keyDown(stage, { key: " " });
    const preview = await screen.findByRole("dialog", { name: "Preview A.jpg" });
    fireEvent.click(within(preview).getByRole("button", { name: "Close preview" }));

    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.keyDown(stage, { key: "c" });
    expect(await screen.findByRole("dialog", { name: "Compare two photos" })).toBeTruthy();
  });

  it("用鼠标中键拖动画布，与右键平移保持一致", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const world = stage.querySelector<HTMLElement>(".worktable-world");
    if (!world) throw new Error("worktable world missing");
    const before = world.style.transform;
    fireEvent.pointerDown(stage, { pointerId: 32, button: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(stage, { pointerId: 32, button: 1, clientX: 260, clientY: 240 });
    fireEvent.pointerUp(stage, { pointerId: 32, button: 1, clientX: 260, clientY: 240 });
    expect(world.style.transform).not.toBe(before);
  });

  it("选中操作栏保持单行、使用精简文案且不显示 Clear", async () => {
    const dependencies = await createFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    const toolbar = within(screen.getByRole("group", { name: "Table selection actions" }));
    expect(toolbar.getByText("2 photos")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Table arrangement tools" })).getByRole("button", { name: "Create Sequence" }).textContent).toContain("Sequence");
    const cardA = screen.getByLabelText("A.jpg");
    const cardB = screen.getByLabelText("B.jpg");
    const beforeShuffle = [cardA.style.transform, cardB.style.transform];
    const shuffle = within(screen.getByRole("group", { name: "Table arrangement tools" })).getByRole("button", { name: "Shuffle" });
    expect(shuffle.hasAttribute("disabled")).toBe(false);
    fireEvent.click(shuffle);
    expect([cardA.style.transform, cardB.style.transform]).not.toEqual(beforeShuffle);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect([cardA.style.transform, cardB.style.transform]).toEqual(beforeShuffle);
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

  it("reloads failed worktable photos after reconnecting a restored source", async () => {
    const dependencies = await createFixture();
    let connected = false;
    const originalPreview = dependencies.photoSource.derivedPreview.bind(dependencies.photoSource);
    vi.spyOn(dependencies.photoSource, "derivedPreview").mockImplementation(async (id: PhotoId) =>
      connected ? originalPreview(id) : err({ kind: "preview-unavailable" as const, photoId: id }),
    );
    const originalRestore = dependencies.photoSource.restoreFolder.bind(dependencies.photoSource);
    vi.spyOn(dependencies.photoSource, "restoreFolder").mockImplementation(async (id) => {
      const restored = await originalRestore(id);
      if (restored.ok) connected = true;
      return restored;
    });

    render(<App dependencies={dependencies} />);
    const card = await screen.findByLabelText("A.jpg");
    await waitFor(() => expect(card.classList.contains("is-missing")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Manage photo sources" }));
    const manager = screen.getByRole("dialog", { name: "Manage photo sources" });
    fireEvent.click(within(manager).getByRole("button", { name: "Remove source" }));
    fireEvent.click(await within(manager).findByRole("button", { name: "Reconnect" }));

    await waitFor(() => expect(within(card).getByAltText("A.jpg")).toBeTruthy());
    expect(card.classList.contains("is-missing")).toBe(false);
  });

  it("keeps header controls together and does not render the retired Sequence Order panel", async () => {
    render(<App dependencies={await createPileFixture()} />);
    await screen.findByLabelText("Photo worktable");
    const header = screen.getByRole("button", { name: "Back to Home" }).closest("header")!;
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
    expect(screen.queryByRole("region", { name: "Sequence Order" })).toBeNull();
    expect(document.querySelector(".table-sequence-panel-host")).toBeNull();
  });

  it("通过右下角手柄缩放 Sequence 卡片且不会误打开网格覆盖层", async () => {
    render(<App dependencies={await createPileFixture()} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const pile = await screen.findByLabelText("Sequence pile Sequence 01");
    const handle = within(pile).getByRole("button", { name: "Resize sequence pile" });
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON() {} }),
    });

    expect(pile.style.width).toBe("280px");
    expect(pile.style.height).toBe("176px");
    fireEvent.pointerDown(handle, { pointerId: 31, button: 0, clientX: 460, clientY: 296 });
    fireEvent.pointerMove(stage, { pointerId: 31, clientX: 530, clientY: 330 });
    fireEvent.pointerUp(stage, { pointerId: 31, clientX: 530, clientY: 330 });

    await waitFor(() => expect(Number.parseFloat(pile.style.width)).toBeGreaterThan(280));
    expect(Number.parseFloat(pile.style.height)).toBeGreaterThan(176);
    expect(screen.queryByRole("dialog", { name: "Sequence Sequence 01" })).toBeNull();
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

  it("拖到序列卡片时加入照片，并从 Table 原位移除", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    const saveWorktable = vi.spyOn(projectStore, "saveWorktable");
    render(<App dependencies={{ projectStore, photoSource }} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const card = screen.getByLabelText("B.jpg");
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    Object.defineProperty(pile, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 350, top: 180, width: 280, height: 176, right: 630, bottom: 356, x: 350, y: 180, toJSON() {} }),
    });
    saveWorktable.mockClear();

    fireEvent.pointerDown(card, { pointerId: 71, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 71, clientX: 430, clientY: 245 });
    expect(pile.classList.contains("is-add-target")).toBe(true);
    fireEvent.pointerUp(stage, { pointerId: 71, clientX: 430, clientY: 245 });

    await waitFor(async () => {
      const sequence = await projectStore.loadSequence(sequenceId);
      expect(sequence.ok && sequence.value.items.map((item) => item.kind === "photo" && item.photoId)).toEqual([photoA, photoB]);
    });
    await waitFor(async () => {
      const after = await projectStore.loadWorkspace(projectId);
      expect(after.ok && after.value.worktableDraft.entryOrder).not.toContain(photoB);
    });
    expect(saveWorktable).toHaveBeenCalled();
    expect(within(stage).queryByLabelText("B.jpg")).toBeNull();
    await waitFor(() => expect(within(pile).getByText("2")).toBeTruthy());
    expect(pile.classList.contains("is-add-target")).toBe(false);
  });

  it("拖过序列再离开时仍按普通移动处理", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const card = screen.getByLabelText("B.jpg");
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    Object.defineProperty(pile, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 350, top: 180, width: 280, height: 176, right: 630, bottom: 356, x: 350, y: 180, toJSON() {} }),
    });
    const before = await projectStore.loadWorkspace(projectId);
    if (!before.ok) throw new Error("workspace not loaded");
    const original = before.value.worktableDraft.placements[photoB];

    fireEvent.pointerDown(card, { pointerId: 72, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 72, clientX: 430, clientY: 245 });
    expect(pile.classList.contains("is-add-target")).toBe(true);
    fireEvent.pointerMove(stage, { pointerId: 72, clientX: 160, clientY: 130 });
    expect(pile.classList.contains("is-add-target")).toBe(false);
    fireEvent.pointerUp(stage, { pointerId: 72, clientX: 160, clientY: 130 });

    await waitFor(async () => {
      const workspace = await projectStore.loadWorkspace(projectId);
      expect(workspace.ok && workspace.value.worktableDraft.placements[photoB].x).toBe(original.x + 60);
    });
    const sequence = await projectStore.loadSequence(sequenceId);
    expect(sequence.ok && sequence.value.items).toHaveLength(1);
  });

  it("在展开的顺序带上松手可插入指定位置", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const card = screen.getByLabelText("B.jpg");
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    Object.defineProperty(pile, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 350, top: 180, width: 280, height: 176, right: 630, bottom: 356, x: 350, y: 180, toJSON() {} }),
    });
    fireEvent.pointerDown(card, { pointerId: 73, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 73, clientX: 430, clientY: 245 });
    const tray = await waitFor(() => {
      const element = stage.querySelector<HTMLElement>("[data-sequence-insert-tray]");
      expect(element).toBeTruthy();
      return element!;
    });
    Object.defineProperty(tray, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 210, top: 356, width: 560, height: 108, right: 770, bottom: 464, x: 210, y: 356, toJSON() {} }),
    });
    fireEvent.pointerMove(stage, { pointerId: 73, clientX: 430, clientY: 350 });
    expect(stage.querySelector("[data-sequence-insert-tray]")).toBeTruthy();
    fireEvent.pointerMove(stage, { pointerId: 73, clientX: 220, clientY: 390 });
    expect(stage.querySelector(".sequence-insert-marker")).toBeTruthy();
    fireEvent.pointerUp(stage, { pointerId: 73, clientX: 220, clientY: 390 });

    await waitFor(async () => {
      const sequence = await projectStore.loadSequence(sequenceId);
      expect(sequence.ok && sequence.value.items.map((item) => item.kind === "photo" && item.photoId)).toEqual([photoB, photoA]);
    });
  });

  it("多选照片可一次拖入同一序列，并按桌面顺序连续加入", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    Object.defineProperty(pile, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 350, top: 180, width: 280, height: 176, right: 630, bottom: 356, x: 350, y: 180, toJSON() {} }),
    });
    fireEvent.keyDown(stage, { key: "a", ctrlKey: true });
    fireEvent.pointerDown(screen.getByLabelText("B.jpg"), { pointerId: 74, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 74, clientX: 430, clientY: 245 });
    expect(pile.classList.contains("is-add-target")).toBe(true);
    fireEvent.pointerUp(stage, { pointerId: 74, clientX: 430, clientY: 245 });

    await waitFor(async () => {
      const sequence = await projectStore.loadSequence(sequenceId);
      expect(sequence.ok && sequence.value.items.map((item) => item.kind === "photo" && item.photoId)).toEqual([photoA, photoA, photoB]);
    });
  });

  it("拖到序列上按 Escape 会取消手势，不移动也不加入", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    Object.defineProperty(pile, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 350, top: 180, width: 280, height: 176, right: 630, bottom: 356, x: 350, y: 180, toJSON() {} }),
    });
    const before = await projectStore.loadWorkspace(projectId);
    if (!before.ok) throw new Error("workspace not loaded");
    const original = before.value.worktableDraft.placements[photoB];
    fireEvent.pointerDown(screen.getByLabelText("B.jpg"), { pointerId: 75, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 75, clientX: 430, clientY: 245 });
    expect(pile.classList.contains("is-add-target")).toBe(true);
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.pointerUp(stage, { pointerId: 75, clientX: 430, clientY: 245 });
    expect(pile.classList.contains("is-add-target")).toBe(false);
    const after = await projectStore.loadWorkspace(projectId);
    const sequence = await projectStore.loadSequence(sequenceId);
    expect(after.ok && after.value.worktableDraft.placements[photoB]).toEqual(original);
    expect(sequence.ok && sequence.value.items).toHaveLength(1);
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
    fireEvent.click(within(screen.getByLabelText("Table toolbar")).getByRole("button", { name: "Delete Sequence" }));
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

  it("Add to Sequence 后实时刷新 Table Sequence 卡片且不渲染底栏", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);

    const pile = await screen.findByLabelText("Sequence pile Sequence 01");
    expect(within(pile).getByText("1")).toBeTruthy();
    expect(screen.queryByLabelText("Sequence Order")).toBeNull();

    const cardB = screen.getByLabelText("B.jpg");
    fireEvent.pointerDown(cardB, { pointerId: 21, button: 0, clientX: 320, clientY: 160 });
    const selectionActions = screen.getByRole("group", { name: "Table arrangement tools" });
    fireEvent.click(within(selectionActions).getByRole("button", { name: "Add to Sequence" }));
    const addButton = await screen.findByRole("button", { name: "Add photos" });
    await waitFor(() => expect(addButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton);

    await waitFor(() => expect(within(pile).getByText("2")).toBeTruthy());
    expect(screen.queryByLabelText("Sequence Order")).toBeNull();

    await waitFor(async () => {
      const saved = await projectStore.loadSequence(sequenceId);
      expect(saved.ok).toBe(true);
      if (saved.ok) expect(saved.value.items.map((item) => item.kind === "photo" ? item.photoId : "blank")).toEqual([photoA, photoB]);
    });
  });

  it("Add to Sequence 保存失败时保留弹窗与未持久化提示", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    vi.spyOn(projectStore, "saveSequence").mockResolvedValue(err({ kind: "quota-exceeded" }));
    render(<App dependencies={{ projectStore, photoSource }} />);

    await screen.findByLabelText("Sequence pile Sequence 01");
    fireEvent.pointerDown(screen.getByLabelText("B.jpg"), { pointerId: 22, button: 0, clientX: 320, clientY: 160 });
    fireEvent.click(within(screen.getByRole("group", { name: "Table arrangement tools" })).getByRole("button", { name: "Add to Sequence" }));
    const addButton = await screen.findByRole("button", { name: "Add photos" });
    await waitFor(() => expect(addButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(addButton);

    expect(await screen.findByText("Sequence save failed. Your edit remains on screen.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Add to Sequence" })).toBeTruthy();
    const saved = await projectStore.loadSequence(sequenceId);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.items).toHaveLength(1);
  });

  it("Add to Sequence 约束焦点、Escape 关闭并返回入口", async () => {
    const { projectStore, photoSource } = await createPileFixture();
    render(<App dependencies={{ projectStore, photoSource }} />);

    await screen.findByLabelText("Sequence pile Sequence 01");
    fireEvent.pointerDown(screen.getByLabelText("B.jpg"), { pointerId: 23, button: 0, clientX: 320, clientY: 160 });
    const opener = within(screen.getByRole("group", { name: "Table arrangement tools" })).getByRole("button", { name: "Add to Sequence" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Add to Sequence" });
    const addButton = within(dialog).getByRole("button", { name: "Add photos" });
    addButton.focus();
    fireEvent.keyDown(addButton, { key: "Tab" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Add to Sequence" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("在 Sequence 中移除照片后返回 Table 会刷新序列卡片数量", async () => {
    const { projectStore, photoSource, sequenceId } = await createPileFixture();
    const loaded = await projectStore.loadSequence(sequenceId);
    if (!loaded.ok) throw new Error("sequence not loaded");
    const extraId = "item-extra" as SequenceItemId;
    const expanded = {
      ...loaded.value,
      items: [...loaded.value.items, { id: extraId, kind: "photo" as const, photoId: photoB }],
      readingUnits: [...loaded.value.readingUnits, { id: "unit-extra" as ReadingUnitId, kind: "single" as const, itemId: extraId }],
    };
    expect((await projectStore.saveSequence(expanded, loaded.value.revision)).ok).toBe(true);
    window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
    render(<App dependencies={{ projectStore, photoSource }} />);
    const overlay = await screen.findByRole("dialog", { name: "Sequence Sequence 01" });
    const card = within(overlay).getByRole("gridcell", { name: "Photo 02" });
    fireEvent.pointerDown(card, { pointerId: 24, button: 0, clientX: 320, clientY: 160 });
    fireEvent.pointerUp(card, { pointerId: 24, clientX: 320, clientY: 160 });
    const preview = screen.queryByRole("dialog", { name: "Preview photo 2" });
    if (preview) fireEvent.click(within(preview).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(overlay, { key: "Delete" });
    fireEvent.click(within(overlay).getByRole("button", { name: "Close Sequence" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sequence Sequence 01" })).toBeNull());
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    await waitFor(() => expect(within(pile).getByText("1")).toBeTruthy());
  });

  it("单击 Sequence 卡片打开网格覆盖层，拖动或 Ctrl 单击不会打开", async () => {
    const dependencies = await createPileFixture();
    render(<App dependencies={dependencies} />);
    const stage = await screen.findByLabelText("Photo worktable");
    const pile = screen.getByLabelText("Sequence pile Sequence 01");
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON() {} }),
    });

    fireEvent.pointerDown(pile, { pointerId: 41, button: 0, clientX: 240, clientY: 170, ctrlKey: true });
    fireEvent.pointerUp(stage, { pointerId: 41, clientX: 240, clientY: 170, ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "Sequence Sequence 01" })).toBeNull();

    fireEvent.pointerDown(pile, { pointerId: 42, button: 0, clientX: 240, clientY: 170 });
    fireEvent.pointerMove(stage, { pointerId: 42, clientX: 270, clientY: 190 });
    fireEvent.pointerUp(stage, { pointerId: 42, clientX: 270, clientY: 190 });
    expect(screen.queryByRole("dialog", { name: "Sequence Sequence 01" })).toBeNull();

    fireEvent.pointerDown(pile, { pointerId: 43, button: 0, clientX: 270, clientY: 190 });
    fireEvent.pointerUp(stage, { pointerId: 43, clientX: 270, clientY: 190 });
    expect(await screen.findByRole("dialog", { name: "Sequence Sequence 01" })).toBeTruthy();
    expect(window.location.hash).toBe(`#/projects/${projectId}/sequences/${dependencies.sequenceId}`);
    expect(screen.getByLabelText("Photo worktable")).toBe(stage);

    fireEvent.click(screen.getByRole("button", { name: "Close Sequence" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sequence Sequence 01" })).toBeNull());
    expect(window.location.hash).toBe(`#/projects/${projectId}/table`);
    expect(screen.getByLabelText("Photo worktable")).toBe(stage);
  });

});
