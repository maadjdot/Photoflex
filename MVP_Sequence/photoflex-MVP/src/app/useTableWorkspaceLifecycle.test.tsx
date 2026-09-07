// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProjectId, WorktableViewport } from "../contracts";
import { MemoryPhotoSource } from "../platform/memory/MemoryPhotoSource";
import { MemoryProjectStore } from "../platform/memory/MemoryProjectStore";
import { createProjectWriteCoordinator } from "./projectWriteCoordinator";
import { useTableWorkspaceLifecycle } from "./useTableWorkspaceLifecycle";

const projectId = "table-lifecycle-project" as ProjectId;

it("restores Table state and persists the latest viewport through its lifecycle interface", async () => {
  const projectStore = new MemoryProjectStore();
  const created = await projectStore.createProject({ id: projectId, name: "Lifecycle", createdAt: "2026-09-07T00:00:00.000Z" });
  if (!created.ok) throw new Error("project fixture failed");
  const restoredViewport: WorktableViewport = { originX: 120, originY: 80, zoom: 0.75 };
  const saved = await projectStore.saveWorkspace({
    ...created.value,
    resumeContext: { page: "table", filter: "all", tableViewport: restoredViewport },
  }, created.value.revision);
  if (!saved.ok) throw new Error("workspace fixture failed");
  const workspace = await projectStore.loadWorkspace(projectId);
  if (!workspace.ok) throw new Error("workspace fixture could not be loaded");
  const coordinator = createProjectWriteCoordinator({ projectStore, photoSource: new MemoryPhotoSource() }, projectId);
  const resetCommittedDraft = vi.fn();
  const onInitialized = vi.fn();
  const onError = vi.fn();
  const { result, unmount } = renderHook(() => useTableWorkspaceLifecycle({
    projectId,
    workspace: workspace.value,
    coordinator,
    resetCommittedDraft,
    activeSequenceId: undefined,
    onInitialized,
    onError,
  }));

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.initialViewport).toEqual(restoredViewport);
  expect(resetCommittedDraft).toHaveBeenCalledWith(workspace.value.worktableDraft);
  await waitFor(() => expect(onInitialized).toHaveBeenCalledWith({ summaries: [], activeSequenceId: undefined }));

  const nextViewport: WorktableViewport = { originX: 240, originY: 160, zoom: 1.25 };
  act(() => result.current.onViewportChange(nextViewport));
  await new Promise((resolve) => window.setTimeout(resolve, 550));
  await coordinator.flush();
  const persisted = await projectStore.loadWorkspace(projectId);
  expect(persisted.ok && persisted.value.resumeContext?.tableViewport).toEqual(nextViewport);

  unmount();
  coordinator.dispose();
});
