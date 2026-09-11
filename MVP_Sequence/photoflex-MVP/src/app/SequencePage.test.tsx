// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ProjectId, SequenceDocument, SequenceId, SequenceItemId, SequenceVersion, VersionId } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { App } from "./App";

afterEach(() => {
  cleanup();
  window.location.hash = "#/";
});

it("allows duplicating an unchanged Sequence after switching", async () => {
  const projectStore = new MemoryProjectStore();
  const projectId = "sequence-switch-project" as ProjectId;
  const created = await projectStore.createProject({ id: projectId, name: "Sequence switch", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const first = sequenceFixture(projectId, "sequence-first", "First", "first-item", "first-version");
  const second = sequenceFixture(projectId, "sequence-second", "Second", "second-item", "second-version");
  const firstCreated = await projectStore.createSequence(projectId, created.value.revision, first.sequence, first.version, created.value.worktableDraft);
  expect(firstCreated.ok).toBe(true);
  const current = await projectStore.loadWorkspace(projectId);
  if (!current.ok) throw new Error("workspace fixture failed");
  const secondCreated = await projectStore.createSequence(projectId, current.value.revision, second.sequence, second.version, current.value.worktableDraft);
  expect(secondCreated.ok).toBe(true);
  window.location.hash = `#/projects/${projectId}/sequences/${first.sequence.id}`;

  render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);
  const picker = await screen.findByRole("combobox", { name: "Sequence" });
  const duplicateButton = screen.getByRole("button", { name: "Duplicate New Sequence" }) as HTMLButtonElement;
  await waitFor(() => expect(duplicateButton.disabled).toBe(false));

  fireEvent.change(picker, { target: { value: second.sequence.id } });

  await waitFor(() => expect((screen.getByRole("combobox", { name: "Sequence" }) as HTMLSelectElement).value).toBe(second.sequence.id));
  expect((screen.getByRole("button", { name: "Duplicate New Sequence" }) as HTMLButtonElement).disabled).toBe(false);
});

it("opens Read as a keyboard-navigable modal and restores focus when it closes", async () => {
  const projectStore = new MemoryProjectStore();
  const projectId = "sequence-read-project" as ProjectId;
  const created = await projectStore.createProject({ id: projectId, name: "Sequence read", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const sequenceId = "sequence-readable" as SequenceId;
  const versionId = "sequence-readable-version" as VersionId;
  const firstId = "read-first" as SequenceItemId;
  const secondId = "read-second" as SequenceItemId;
  const items = [{ id: firstId, kind: "blank" as const }, { id: secondId, kind: "blank" as const }];
  const readingUnits = items.map((item, index) => ({ id: `read-unit-${index}` as SequenceDocument["readingUnits"][number]["id"], kind: "blank" as const, itemId: item.id }));
  const sequence: SequenceDocument = { id: sequenceId, projectId, name: "Readable", items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: "Initial · Readable", itemCount: 2, items, segments: [], readingUnits, createdAt: sequence.createdAt };
  expect((await projectStore.createSequence(projectId, created.value.revision, sequence, version, created.value.worktableDraft)).ok).toBe(true);
  window.location.hash = `#/projects/${projectId}/sequences/${sequenceId}`;

  render(<App dependencies={{ projectStore, photoSource: new MemoryPhotoSource() }} />);
  const readButton = await screen.findByRole("button", { name: "Read" });
  readButton.focus();
  fireEvent.click(readButton);

  const readDialog = await screen.findByRole("dialog", { name: "Read Readable" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(readDialog.textContent).toContain("02 / 2 · 2 / 2");
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Read Readable" })).toBeNull());
  expect(document.activeElement).toBe(readButton);
});

function sequenceFixture(projectId: ProjectId, id: string, name: string, itemIdValue: string, versionIdValue: string) {
  const sequenceId = id as SequenceId;
  const itemId = itemIdValue as SequenceItemId;
  const versionId = versionIdValue as VersionId;
  const items = [{ id: itemId, kind: "blank" as const }];
  const readingUnits = [{ id: `${itemIdValue}-unit` as SequenceDocument["readingUnits"][number]["id"], kind: "blank" as const, itemId }];
  const sequence: SequenceDocument = { id: sequenceId, projectId, name, items, segments: [], readingUnits, currentVersionId: versionId, revision: 0 as SequenceDocument["revision"], createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };
  const version: SequenceVersion = { id: versionId, projectId, sequenceId, name: `Initial · ${name}`, itemCount: 1, items, segments: [], readingUnits, createdAt: sequence.createdAt };
  return { sequence, version };
}
