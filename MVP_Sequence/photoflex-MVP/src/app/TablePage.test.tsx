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
    expect(screen.getByRole("button", { name: "Table" }).className).toContain("is-active");
    const cardA = screen.getByLabelText("A.jpg");
    expect(cardA).toBeTruthy();
    expect(screen.getByLabelText("B.jpg")).toBeTruthy();
    expect(screen.queryByText("A.jpg")).toBeNull();
    const toolbar = within(screen.getByLabelText("Table 工具栏"));
    expect(toolbar.queryByRole("button", { name: "Contact Sheet" })).toBeNull();
    expect(toolbar.getByText("Table Project")).toBeTruthy();
    expect((toolbar.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Hand" })).toBeNull();
    expect(within(screen.getByLabelText("Table 工具栏")).getByRole("button", { name: "Group" })).toBeTruthy();
    expect(screen.queryByText(/Juxtapose/)).toBeNull();

    fireEvent.doubleClick(cardA);
    expect(await screen.findByRole("dialog", { name: "Preview A.jpg" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Preview A.jpg" }).querySelector(".table-preview-image-wrap")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));

    const mainNavigation = screen.getByLabelText("主导航");
    const contactSheet = within(mainNavigation).getByRole("button", { name: "Photos" });
    await waitFor(() => expect((contactSheet as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(contactSheet);
    expect(window.location.hash).toBe(`#/projects/${projectId}/sources/${sourceId}`);
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
    fireEvent.pointerMove(stage, { pointerId: 7, clientX: 145, clientY: 130 });
    fireEvent.pointerUp(stage, { pointerId: 7, clientX: 145, clientY: 130 });

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const saved = await dependencies.projectStore.loadWorkspace(projectId);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.worktableDraft.placements[photoA].x).toBe(109);
    expect(saved.value.worktableDraft.placements[photoA].y).toBe(94);
    expect(saved.value.sequenceIds).toEqual([]);
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
    fireEvent.click(within(screen.getByLabelText("Table 工具栏")).getByRole("button", { name: "Remove" }));

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

});
