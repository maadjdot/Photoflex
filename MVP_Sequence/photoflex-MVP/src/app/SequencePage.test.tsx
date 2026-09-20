// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PhotoId, ProjectId, ReadingUnitId, SequenceDocument, SequenceId, SequenceItemId, SequenceVersion, VersionId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

afterEach(() => {
  cleanup();
  window.location.hash = "#/";
});

it("keeps a legacy Sequence deep link on the Table and closes back to that Table", async () => {
  const { projectStore, projectId, sequenceId } = await createSequenceFixture("deep-link", [photoItem("photo-a", "item-a")]);
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;

  render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);
  const table = await screen.findByLabelText("Photo worktable");
  expect(await screen.findByRole("dialog", { name: "Sequence Sequence deep-link" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close Sequence" }));

  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sequence Sequence deep-link" })).toBeNull());
  expect(window.location.hash).toBe(`#/projects/${projectId}/table`);
  expect(screen.getByLabelText("Photo worktable")).toBe(table);
});

it("hides legacy Blank and Text items and exposes no former Layout editing tools", async () => {
  const items: SequenceDocument["items"] = [
    { id: "blank" as SequenceItemId, kind: "blank" },
    { id: "text" as SequenceItemId, kind: "text", text: "Legacy layout text", fontSize: 24 },
  ];
  const { projectStore, projectId, sequenceId } = await createSequenceFixture("legacy-layout", items);
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;

  render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);
  const overlay = await screen.findByRole("dialog", { name: "Sequence Sequence legacy-layout" });
  expect(within(overlay).queryAllByRole("gridcell")).toHaveLength(0);
  expect((within(overlay).getByRole("button", { name: "Read" }) as HTMLButtonElement).disabled).toBe(true);
  for (const removed of ["Insert Blank", "Insert Text", "Create Spread", "Export PDF", "Duplicate New Sequence"]) {
    expect(within(overlay).queryByRole("button", { name: removed })).toBeNull();
  }
  expect(overlay.textContent).not.toContain("Legacy layout text");
});

async function createSequenceFixture(suffix: string, items: SequenceDocument["items"]) {
  const projectStore = new MemoryProjectStore();
  const projectId = `sequence-${suffix}-project` as ProjectId;
  const sequenceId = `sequence-${suffix}` as SequenceId;
  const versionId = `version-${suffix}` as VersionId;
  const created = await projectStore.createProject({ id: projectId, name: `Project ${suffix}`, createdAt: "2026-09-16T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const readingUnits: SequenceDocument["readingUnits"] = items.map((item, index) => ({
    id: `unit-${suffix}-${index}` as ReadingUnitId,
    kind: item.kind === "blank" ? "blank" as const : "single" as const,
    itemId: item.id,
  }));
  const sequence: SequenceDocument = { id: sequenceId, projectId, name: `Sequence ${suffix}`, items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial", itemCount: items.length, items, segments: [], readingUnits, createdAt: sequence.createdAt };
  expect((await projectStore.createSequence(projectId, created.value.revision, sequence, version, created.value.worktableDraft)).ok).toBe(true);
  return { projectStore, projectId, sequenceId };
}

function photoItem(photoId: string, itemId: string): Extract<SequenceDocument["items"][number], { kind: "photo" }> {
  return { id: itemId as SequenceItemId, kind: "photo", photoId: photoId as PhotoId };
}
