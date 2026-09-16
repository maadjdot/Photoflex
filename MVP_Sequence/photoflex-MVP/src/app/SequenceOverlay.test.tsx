// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceVersion, SourceId, VersionId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

afterEach(() => {
  cleanup();
  window.location.hash = "#/";
});

it("opens a single-photo preview from the grid and enters continuous Read only from the Read button", async () => {
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
  const items = [
    { id: "photo-landscape" as SequenceItemId, kind: "photo" as const, photoId: landscape },
    { id: "legacy-blank" as SequenceItemId, kind: "blank" as const },
    { id: "legacy-text" as SequenceItemId, kind: "text" as const, text: "Hidden note", fontSize: 24 },
    { id: "photo-portrait" as SequenceItemId, kind: "photo" as const, photoId: portrait },
  ];
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
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;

  render(<App dependencies={{ projectStore, photoSource }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Complete photos" });
  const grid = within(overlay).getByRole("grid", { name: "Sequence photo order" });
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

  const preview = await screen.findByRole("dialog", { name: "Preview photo 1" });
  expect(screen.queryByRole("dialog", { name: "Read Complete photos" })).toBeNull();
  expect(within(preview).getByText("01 / 02")).toBeTruthy();
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
