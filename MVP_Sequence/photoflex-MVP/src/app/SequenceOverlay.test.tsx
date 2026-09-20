// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceVersion, SourceId, VersionId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

beforeEach(() => {
  if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  window.location.hash = "#/";
});

async function createOverlayFixture(singlePhoto = false) {
  const projectStore = new MemoryProjectStore();
  const projectId = "sequence-overlay-project" as ProjectId;
  const sourceId = "sequence-overlay-source" as SourceId;
  const sequenceId = "sequence-overlay" as SequenceId;
  const versionId = "sequence-overlay-version" as VersionId;
  const landscape = "landscape" as PhotoId;
  const portrait = "portrait" as PhotoId;
  const created = await projectStore.createProject({
    id: projectId,
    name: "Overlay project",
    createdAt: "2026-09-16T00:00:00.000Z",
    initialSource: { id: sourceId, displayName: "Photos", createdAt: "2026-09-16T00:00:00.000Z" },
  });
  if (!created.ok) throw new Error("project fixture failed");
  const fullItems = [
    { id: "photo-landscape" as SequenceItemId, kind: "photo" as const, photoId: landscape },
    { id: "legacy-blank" as SequenceItemId, kind: "blank" as const },
    { id: "legacy-text" as SequenceItemId, kind: "text" as const, text: "Hidden note", fontSize: 24 },
    { id: "photo-portrait" as SequenceItemId, kind: "photo" as const, photoId: portrait },
  ];
  const items = singlePhoto ? fullItems.slice(0, 1) : fullItems;
  const readingUnits: SequenceDocument["readingUnits"] = items.map((item, index) => ({
    id: `unit-${index}` as ReadingUnitId,
    kind: item.kind === "blank" ? "blank" as const : "single" as const,
    itemId: item.id,
  }));
  const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Complete photos", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial", itemCount: items.length, items, segments: [], readingUnits, createdAt: sequence.createdAt };
  expect((await projectStore.createSequence(projectId, created.value.revision, sequence, version, created.value.worktableDraft)).ok).toBe(true);
  const photoSource = new MemoryPhotoSource([{
    grant: { sourceId, displayName: "Photos", status: "ready", restored: true },
    photos: [
      { id: landscape, sourceId, relativePath: "landscape.jpg", width: 1600, height: 900 },
      { id: portrait, sourceId, relativePath: "portrait.jpg", width: 900, height: 1600 },
    ],
    previewUrls: { [landscape]: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", [portrait]: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
  }]);
  return { projectStore, photoSource, projectId, sequenceId, landscape, portrait };
}

it("opens a single-photo preview from the grid and enters continuous Read only from the Read button", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;

  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const grid = within(overlay).getByRole("grid", { name: "Sequence photo order" });
  expect(within(overlay).getByRole("button", { name: "Create Sequence Folder" })).toBeTruthy();
  expect(within(grid).getAllByRole("gridcell")).toHaveLength(2);
  expect(grid.textContent).not.toContain("Hidden note");
  await waitFor(() => expect(grid.querySelectorAll("img")).toHaveLength(2));
  for (const image of grid.querySelectorAll("img")) expect(getComputedStyle(image).objectFit).toBe("contain");
  await waitFor(() => expect(within(grid).getByRole("gridcell", { name: "Photo 01" }).className).toContain("is-landscape"));
  expect(within(grid).getByRole("gridcell", { name: "Photo 02" }).className).toContain("is-portrait");

  const firstCard = within(grid).getByRole("gridcell", { name: "Photo 01" });
  fireEvent.pointerDown(firstCard, { pointerId: 51, button: 0, clientX: 120, clientY: 180 });
  fireEvent.pointerUp(firstCard, { pointerId: 51, clientX: 120, clientY: 180 });
  fireEvent.click(firstCard);

  let preview = await screen.findByRole("dialog", { name: "Preview photo 1" });
  expect(screen.queryByRole("dialog", { name: "Read Complete photos" })).toBeNull();
  expect(within(preview).getByText("01 / 02")).toBeTruthy();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  const nextPreview = await screen.findByRole("dialog", { name: "Preview photo 2" });
  expect(within(nextPreview).getByAltText("Sequence photograph 2")).toBeTruthy();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(await screen.findByRole("dialog", { name: "Preview photo 1" })).toBeTruthy();
  preview = screen.getByRole("dialog", { name: "Preview photo 1" });
  const previewImage = within(preview).getByAltText("Sequence photograph 1").parentElement as HTMLElement;
  const previewMedia = preview.querySelector(".sequence-photo-preview-media") as HTMLDivElement;
  previewMedia.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 400, width: 400, height: 400, toJSON: () => ({}) });
  fireEvent.wheel(previewMedia, { deltaY: -Math.log(1.25) / .0015, clientX: 300, clientY: 200 });
  expect(within(preview).getByRole("button", { name: "Reset zoom" }).textContent).toBe("125%");
  expect(previewMedia.classList.contains("is-pannable")).toBe(true);
  expect(previewImage.style.transform).toContain("translate3d(-25px, 0px, 0)");
  fireEvent(previewMedia, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 300, clientY: 200 }));
  fireEvent(previewMedia, new MouseEvent("pointermove", { bubbles: true, clientX: 340, clientY: 220 }));
  expect(previewImage.style.transform).toContain("translate3d(15px, 20px, 0)");
  fireEvent(previewMedia, new MouseEvent("pointerup", { bubbles: true, clientX: 340, clientY: 220 }));
  fireEvent.click(within(preview).getByRole("button", { name: "Rotate right" }));
  expect(previewImage.dataset.rotation).toBe("90");
  fireEvent.keyDown(window, { key: "r", shiftKey: true });
  expect(previewImage.dataset.rotation).toBe("0");
  fireEvent.keyDown(window, { key: "0" });
  expect(within(preview).getByRole("button", { name: "Reset zoom" }).textContent).toBe("100%");
  fireEvent.click(within(preview).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Preview photo 1" })).toBeNull());

  fireEvent.click(within(overlay).getByRole("button", { name: "Read" }));
  const read = await screen.findByRole("dialog", { name: "Read Complete photos" });
  const track = within(read).getByRole("group", { name: "Continuous photo reader" }) as HTMLElement;
  Object.defineProperties(track, {
    clientWidth: { configurable: true, value: 1000 },
    scrollWidth: { configurable: true, value: 2400 },
  });
  track.scrollLeft = 0;
  fireEvent.wheel(track, { deltaX: 0, deltaY: 120 });
  expect(track.scrollLeft).toBe(120);
  expect(within(read).getByText("01 / 02")).toBeTruthy();
  for (const image of track.querySelectorAll("img")) expect(getComputedStyle(image).objectFit).toBe("contain");

  fireEvent.click(within(read).getByRole("button", { name: "Next photo" }));
  expect(within(read).getByText("02 / 02")).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Read Complete photos" })).toBeNull());
  expect(screen.getByRole("dialog", { name: "Sequence Complete photos" })).toBeTruthy();
});

it("responds when Create Sequence Folder is clicked", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  fireEvent.click(within(overlay).getByRole("button", { name: "Create Sequence Folder" }));
  expect(await screen.findByText("Folder export is not supported in this browser.")).toBeTruthy();
});

it("supports Space for the selected preview and R for Read mode", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const first = within(overlay).getByRole("gridcell", { name: "Photo 01" });
  fireEvent.pointerDown(first, { pointerId: 52, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(first, { pointerId: 52, clientX: 100, clientY: 100 });
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Preview photo 1" })).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(overlay, { key: " " });
  expect(await screen.findByRole("dialog", { name: "Preview photo 1" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("dialog", { name: "Preview photo 1" })).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(overlay, { key: "r" });
  expect(await screen.findByRole("dialog", { name: "Read Complete photos" })).toBeTruthy();
});

it("uses arrow keys to select the next Sequence photo", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const grid = within(overlay).getByRole("grid", { name: "Sequence photo order" });
  const first = within(grid).getByRole("gridcell", { name: "Photo 01" });
  fireEvent.pointerDown(first, { pointerId: 53, button: 0, ctrlKey: true, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(first, { pointerId: 53, button: 0, ctrlKey: true, clientX: 100, clientY: 100 });
  fireEvent.keyDown(overlay, { key: "ArrowRight" });
  expect(within(grid).getByRole("gridcell", { name: "Photo 02" }).getAttribute("aria-selected")).toBe("true");
});

it("clears the current selection when the empty Sequence canvas is clicked", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const grid = within(overlay).getByRole("grid", { name: "Sequence photo order" });
  const first = within(grid).getByRole("gridcell", { name: "Photo 01" });
  fireEvent.pointerDown(first, { pointerId: 54, button: 0, ctrlKey: true, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(first, { pointerId: 54, button: 0, ctrlKey: true, clientX: 100, clientY: 100 });
  expect(first.getAttribute("aria-selected")).toBe("true");
  fireEvent.pointerDown(grid, { pointerId: 55, button: 0, clientX: 1400, clientY: 700 });
  expect(first.getAttribute("aria-selected")).toBe("false");
});

it("removes a selected photo with Delete without deleting the source photo", async () => {
  const { projectStore, photoSource, projectId, sequenceId, portrait } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const grid = within(overlay).getByRole("grid", { name: "Sequence photo order" });

  expect(within(overlay).queryByRole("button", { name: /Remove/ })).toBeNull();
  const second = within(grid).getByRole("gridcell", { name: "Photo 02" });
  fireEvent.pointerDown(second, { pointerId: 60, button: 0, clientX: 320, clientY: 100 });
  fireEvent.pointerUp(second, { pointerId: 60, clientX: 320, clientY: 100 });
  const preview = screen.queryByRole("dialog", { name: "Preview photo 2" });
  if (preview) fireEvent.click(within(preview).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(overlay, { key: "Delete" });

  await waitFor(() => expect(within(grid).getAllByRole("gridcell")).toHaveLength(1));
  await waitFor(async () => {
    const saved = await projectStore.loadSequence(sequenceId);
    expect(saved.ok && saved.value.items.some((item) => item.kind === "photo" && item.photoId === portrait)).toBe(false);
  });
  expect((await photoSource.getPhoto(portrait)).ok).toBe(true);
});

it("supports multi-select removal with Backspace without opening a preview on modifier click", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const grid = within(overlay).getByRole("grid", { name: "Sequence photo order" });
  const first = within(grid).getByRole("gridcell", { name: "Photo 01" });
  const second = within(grid).getByRole("gridcell", { name: "Photo 02" });
  fireEvent.pointerDown(first, { pointerId: 61, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(first, { pointerId: 61, clientX: 100, clientY: 100 });
  fireEvent.click(first);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Preview photo 1" })).getByRole("button", { name: "Close" }));
  fireEvent.pointerDown(second, { pointerId: 62, button: 0, ctrlKey: true, clientX: 320, clientY: 100 });
  fireEvent.pointerUp(second, { pointerId: 62, ctrlKey: true, clientX: 320, clientY: 100 });
  fireEvent.click(second, { ctrlKey: true });
  expect(screen.queryByRole("dialog", { name: "Preview photo 2" })).toBeNull();
  expect(within(overlay).queryByRole("button", { name: /Remove/ })).toBeNull();
  fireEvent.keyDown(overlay, { key: "Backspace" });

  await waitFor(() => expect(within(grid).queryAllByRole("gridcell")).toHaveLength(0));
  await waitFor(async () => {
    const saved = await projectStore.loadSequence(sequenceId);
    expect(saved.ok && saved.value.items.map((item) => item.kind)).toEqual(["blank", "text"]);
  });
});

it("removes the selected photo with Delete but protects a Sequence's final item", async () => {
  const { projectStore, photoSource, projectId, sequenceId } = await createOverlayFixture();
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;
  const view = render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const first = within(overlay).getByRole("gridcell", { name: "Photo 01" });
  fireEvent.pointerDown(first, { pointerId: 63, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(first, { pointerId: 63, clientX: 100, clientY: 100 });
  const preview = screen.queryByRole("dialog", { name: "Preview photo 1" });
  if (preview) fireEvent.click(within(preview).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(overlay, { key: "Delete" });
  await waitFor(async () => {
    const saved = await projectStore.loadSequence(sequenceId);
    expect(saved.ok && saved.value.items.some((item) => item.id === "photo-landscape")).toBe(false);
  });
  view.unmount();

  const single = await createOverlayFixture(true);
  window.location.hash = `#/projects/${single.projectId}/sequences/${single.sequenceId}`;
  render(<App dependencies={{ projectStore: single.projectStore, photoSource: single.photoSource }} />);
  const singleOverlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  expect(within(singleOverlay).queryByRole("button", { name: /Remove/ })).toBeNull();
  const singleCard = within(singleOverlay).getByRole("gridcell", { name: "Photo 01" });
  fireEvent.pointerDown(singleCard, { pointerId: 64, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(singleCard, { pointerId: 64, clientX: 100, clientY: 100 });
  const singlePreview = screen.queryByRole("dialog", { name: "Preview photo 1" });
  if (singlePreview) fireEvent.click(within(singlePreview).getByRole("button", { name: "Close" }));
  fireEvent.keyDown(singleOverlay, { key: "Backspace" });
  await waitFor(async () => {
    const saved = await single.projectStore.loadSequence(single.sequenceId);
    expect(saved.ok && saved.value.items).toHaveLength(1);
  });
  expect(within(singleOverlay).getByRole("status").textContent).toContain("could not be removed");
});
